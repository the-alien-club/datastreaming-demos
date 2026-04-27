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

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import {
  platformProvider,
  runPlatformResponse,
  type PlatformResponseResult,
} from "@/lib/platform/responses_stream"
import { badRequest, conflict, notFound, unauthorized } from "@/lib/api-response"
import {
  extractPlainTextFromParts,
  filterPersistableParts,
} from "@/lib/chat/persisted-parts"

export const dynamic = "force-dynamic"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL!

interface ChatRequestBody {
  messages?: Array<{
    role: string
    parts?: Array<{ type: string; text?: string }>
    content?: string
  }>
  agentId?: string
  conversationId?: string
}

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
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const accessToken = await resolveAccessToken(session.user.id)

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return badRequest("Invalid JSON body")
  }

  if (!body.agentId) return badRequest("agentId required")

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, body.agentId), eq(agents.userId, session.user.id)),
  })
  if (!agent) return notFound("Agent not found")
  if (agent.workflowId === null) {
    return conflict("Agent has no platform workflow yet — finish configuring it first")
  }

  const userMessage = extractUserMessage(body)
  if (!userMessage) return badRequest("No user message text found in request")

  const existingConversation = body.conversationId
    ? await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, body.conversationId),
          eq(conversations.userId, session.user.id),
        ),
      })
    : null
  if (body.conversationId && !existingConversation) {
    return notFound("Conversation not found")
  }

  const conversationId = body.conversationId ?? crypto.randomUUID()

  if (!existingConversation) {
    await db.insert(conversations).values({
      id: conversationId,
      agentId: body.agentId,
      userId: session.user.id,
      sessionId: null,
      title: userMessage.slice(0, 80) || "New conversation",
    })
  }

  await db.insert(messages).values({
    id: crypto.randomUUID(),
    conversationId,
    role: "user",
    content: userMessage,
  })

  const provider = platformProvider({
    baseURL: `${PLATFORM_API_URL}/agent/${agent.workflowId}`,
    accessToken,
  })

  // Wire the request's abort signal through to the upstream call. When
  // the client closes the tab mid-stream the platform connection is
  // cancelled instead of being held open until the workflow finishes.
  const signal = request.signal

  // Hold the result so the persistence branch can read responseId/usage
  // after the chunk stream drains.
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
      })
    },
    onError: error => {
      console.error("Chat stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
  })

  // Tee the chunk stream: one branch goes to the SSE response the client
  // reads, the other is drained through `readUIMessageStream` so we
  // capture the assembled assistant `UIMessage` (text bubbles, tool-call
  // chips, subagent panels) and persist its `parts` for replay on refresh.
  const [forClient, forPersist] = chunkStream.tee()

  void persistAssistantMessage({
    chunkStream: forPersist,
    conversationId,
    fallbackSessionId: existingConversation?.sessionId ?? null,
    getResult: () => platformResult,
  })

  return createUIMessageStreamResponse({ stream: forClient })
}

// ── Background persistence ────────────────────────────────────────────────────

interface PersistArgs {
  chunkStream: ReadableStream<UIMessageChunk>
  conversationId: string
  fallbackSessionId: string | null
  getResult: () => PlatformResponseResult | null
}

/**
 * Drain the tee'd UI-message chunk stream and write the assistant turn to
 * Postgres. Stores both the plain-text concatenation and the structured
 * `parts` array so a tab refresh can replay tool-call chips and subagent
 * panels exactly as they streamed in.
 *
 * Errors are caught and logged but never thrown — the SSE stream the
 * client is reading is independent and must not be interrupted by
 * persistence failures.
 */
async function persistAssistantMessage({
  chunkStream,
  conversationId,
  fallbackSessionId,
  getResult,
}: PersistArgs): Promise<void> {
  let assembled: UIMessage | undefined
  try {
    for await (const message of readUIMessageStream({ stream: chunkStream })) {
      assembled = message
    }
  } catch (e) {
    // Mid-stream failure: still try to persist whatever the translator
    // captured up to that point so partial answers aren't lost.
    console.error("[chat] failed to drain chunk stream for persistence:", e)
  }

  const result = getResult()
  const content = result?.text ?? extractPlainTextFromParts(assembled?.parts)
  const persistedParts = filterPersistableParts(assembled?.parts)

  try {
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "assistant",
      content,
      parts: persistedParts.length > 0 ? persistedParts : null,
      metadata: result?.usage ? JSON.stringify({ usage: result.usage }) : null,
    })
    await db
      .update(conversations)
      .set({
        sessionId: result?.responseId ?? fallbackSessionId,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
  } catch (e) {
    console.error("[chat] failed to persist assistant message:", e)
  }
}
