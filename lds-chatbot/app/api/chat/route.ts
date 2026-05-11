// Thin auth proxy: forwards a chat turn to the platform's OpenAI
// Responses-API endpoint via the native AI SDK integration and writes
// the resulting UI parts to the client. Persists user/assistant
// messages and the per-conversation `response_id` to Postgres so each
// turn resumes the agent's session memory.
//
// Persistence stores BOTH the plain-text view (`messages.content`,
// kept for backward compat and the OpenAI-compat path) AND the full
// `UIMessage.parts` array (`messages.parts` jsonb) so a tab refresh
// replays the rich live render — text bubbles, tool-call chips,
// subagent panels — instead of collapsing to plain text.
//
// The platform endpoint (`POST /agent/:workflowId/responses`) is OpenAI
// Responses-API stream-conformant per
// `web-app/packages/backend/lib/streaming/specs/responses_v1.md`.
// Streaming is driven by `platformProvider` + `runPlatformResponse` in
// `lib/platform/responses_stream.ts`.
//
// Persistence approach: `createUIMessageStream`'s `onFinish` callback
// receives the fully assembled `UIMessage` (including all `parts`) after
// the stream drains. We use this instead of `tee()` + `readUIMessageStream`
// because the tee approach requires SSE-encoded bytes but `.tee()` produces
// raw `UIMessageChunk` objects — a format mismatch that silently yields
// nothing and leaves the assembled message empty.

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import {
  platformProvider,
  runPlatformResponse,
  type PlatformResponseResult,
} from "@/lib/platform/responses_stream"
import { Prisma } from "@/lib/generated/prisma/client"
import { badRequest, conflict, notFound, unauthorized } from "@/lib/api-response"
import { chatBodySchema, parseBody, type ChatRequestBody } from "../_validators"
import { extractPlainTextFromParts, filterPersistableParts } from "@/lib/chat/persisted-parts"
import { agentWithSubagents } from "@/models/agents/schema"

export const dynamic = "force-dynamic"

const PLATFORM_API_URL = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "")

function extractUserMessage(body: ChatRequestBody): string {
  const last = body.messages?.[body.messages.length - 1]
  if (!last) return ""
  if (Array.isArray(last.parts)) {
    return last.parts
      .filter(p => p.type === "text")
      .map(p => p.text ?? "")
      .join("")
  }
  return typeof last.content === "string" ? last.content : ""
}

export async function POST(request: Request): Promise<Response> {
  const t0 = Date.now()

  const session = await auth.api.getSession({ headers: request.headers })
  const t1 = Date.now()
  if (!session) return unauthorized()

  const accessToken = await resolveAccessToken(session.user.id)
  const t2 = Date.now()

  const parsed = await parseBody(request, chatBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const agent = await prisma.agent.findFirst({
    where: {
      id: body.agentId,
      OR: [{ userId: session.user.id }, { isPublic: true }],
    },
    ...agentWithSubagents,
  })
  const t3 = Date.now()
  if (!agent) return notFound("Agent not found")
  if (agent.workflowId === null) {
    return conflict("Agent has no platform workflow yet — finish configuring it first")
  }

  const userMessage = extractUserMessage(body)
  if (!userMessage) return badRequest("No user message text found in request")

  const existingConversation = body.conversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: body.conversationId,
          userId: session.user.id,
        },
      })
    : null
  const t4 = Date.now()
  if (body.conversationId && !existingConversation) {
    return notFound("Conversation not found")
  }

  const conversationId = body.conversationId ?? crypto.randomUUID()

  if (!existingConversation) {
    await prisma.conversation.create({
      data: {
        id: conversationId,
        agentId: body.agentId,
        userId: session.user.id,
        sessionId: null,
        title: userMessage.slice(0, 80) || "New conversation",
      },
    })
  }

  await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: userMessage,
    },
  })
  const t5 = Date.now()

  // [DIAG] Structured timing log — remove once latency root cause is confirmed.
  console.error(JSON.stringify({
    event: "chat_pre_stream_timing",
    workflowId: agent.workflowId,
    isNewConversation: !existingConversation,
    ms: {
      session: t1 - t0,
      accessToken: t2 - t1,
      agentLookup: t3 - t2,
      conversationLookup: t4 - t3,
      messageInsert: t5 - t4,
      totalPreStream: t5 - t0,
    },
  }))

  const provider = platformProvider({
    baseURL: `${PLATFORM_API_URL}/agent/${agent.workflowId}`,
    accessToken,
  })

  const subagentNames = new Map<string, string>(
    agent.subagents
      .filter((sa) => sa.nodeId !== null)
      .map((sa) => [sa.nodeId!, sa.name])
  )

  // Wire the request's abort signal through to the upstream call. When
  // the client closes the tab mid-stream the platform connection is
  // cancelled instead of being held open until the workflow finishes.
  const signal = request.signal

  // Hold the result so the onFinish callback can read responseId/usage
  // after the stream drains.
  let platformResult: PlatformResponseResult | null = null

  const chunkStream = createUIMessageStream({
    execute: async ({ writer }) => {
      platformResult = await runPlatformResponse({
        provider,
        prompt: userMessage,
        previousResponseId: existingConversation?.sessionId ?? undefined,
        writer,
        conversationId,
        signal,
        subagentNames,
      })
    },
    onError: error => {
      console.error("Chat stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
    // `onFinish` fires after the stream fully drains on the server side.
    // `event.responseMessage` is the fully assembled UIMessage including all
    // parts (text bubbles, tool-call chips, subagent panels). We use this
    // instead of tee() + readUIMessageStream because tee() produces raw
    // UIMessageChunk objects but readUIMessageStream expects SSE-encoded bytes
    // — the format mismatch silently yields nothing and leaves parts empty.
    onFinish: async ({ responseMessage }) => {
      await persistAssistantMessage({
        responseMessage,
        conversationId,
        fallbackSessionId: existingConversation?.sessionId ?? null,
        getResult: () => platformResult,
      })
    },
  })

  return createUIMessageStreamResponse({ stream: chunkStream })
}

// ── Persistence ───────────────────────────────────────────────────────────────

interface PersistArgs {
  /** Fully assembled UIMessage delivered by createUIMessageStream's onFinish. */
  responseMessage: UIMessage
  conversationId: string
  fallbackSessionId: string | null
  getResult: () => PlatformResponseResult | null
}

/**
 * Write the assistant turn to Postgres from the fully assembled `responseMessage`
 * delivered by `createUIMessageStream`'s `onFinish` callback.
 *
 * Stores both:
 *   - `content`  — plain-text concatenation of all text parts (backward-compat,
 *                  OpenAI-compat path)
 *   - `parts`    — filtered `UIMessage.parts` jsonb array (replays rich rendering
 *                  on tab refresh: text bubbles, tool-call chips, subagent panels)
 *
 * The `PlatformResponseResult` from `runPlatformResponse` provides `responseId`
 * (persisted as `conversation.sessionId` for next-turn `previous_response_id`)
 * and `usage` for the metadata column.
 *
 * Errors are caught and logged but never thrown — `onFinish` runs server-side
 * after the SSE stream is already sent to the client, so a persistence failure
 * must never propagate to the response.
 */
async function persistAssistantMessage({
  responseMessage,
  conversationId,
  fallbackSessionId,
  getResult,
}: PersistArgs): Promise<void> {
  // Plain-text fallback: concatenate all text parts in order. Prefer
  // platformResult.text (accumulated from every text-delta event) when
  // available because it excludes Task()-dispatch control strings that the
  // stream writer already filtered out.
  const result = getResult()
  const parts = filterPersistableParts(responseMessage.parts)
  const content = result?.text || extractPlainTextFromParts(responseMessage.parts)

  if (!content && parts.length === 0) {
    console.error("[chat] assistant message is empty — skipping persist", {
      conversationId,
      hasResult: !!result,
    })
    return
  }

  try {
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content,
        parts: parts.length > 0 ? (parts as unknown as Prisma.InputJsonValue) : undefined,
        metadata: result?.usage ? JSON.stringify({ usage: result.usage }) : null,
      },
    })
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        sessionId: result?.responseId ?? fallbackSessionId,
        updatedAt: new Date(),
      },
    })
  } catch (e) {
    console.error("[chat] failed to persist assistant message:", e)
  }
}
