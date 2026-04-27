// Thin auth proxy that forwards a chat turn to the platform's OpenAI
// Responses-API-compatible endpoint and translates its SSE event stream
// into AI SDK UI message parts for `useChat()`.
//
// The platform endpoint (`POST /agent/:workflowId/responses`) is OpenAI
// Responses-API stream-conformant per
// `web-app/packages/backend/lib/streaming/specs/responses_v1.md`.
// We consume it directly — no bespoke chunk translation, no
// `result.stream.agent.chunks` polling, no auto-reconnect retry envelope.
//
// Per-turn flow:
//   1. Resolve the user's Authentik token from the better-auth session.
//   2. Load the agent and (existing or new) conversation from SQLite.
//   3. POST the user's prompt to the platform's Responses endpoint with
//      `previous_response_id` carrying the conversation's stored
//      response_id for multi-turn continuity (spec §7).
//   4. Translate Responses SSE events to AI SDK UI parts:
//      - `response.output_text.delta` → `text-delta`
//      - non-root `response.output_item.added` (item.id encodes agent
//        identity per spec §4) → `data-subagent` panel
//      - `response.function_call_arguments.done` → `data-toolCall`
//   5. On `response.completed` / `response.failed`, persist the
//      assistant message and update `conversation.sessionId` to the
//      new response_id so the next turn resumes the agent's memory.
//
// Subagent panels render alongside the main assistant text. Item ids
// shaped `agent:<aid>::msg_<n>` carry the agent attribution; the panel
// uses the AgentRegistry from `metadata.x_alien_agent_registry` (read
// off the `response.created` event's `Response.metadata`) for display
// names.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { translateResponseStream } from "@/lib/platform/responses_stream"

export const dynamic = "force-dynamic"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL
if (!PLATFORM_API_URL) {
  throw new Error("PLATFORM_API_URL is required")
}

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
  if (last.parts && Array.isArray(last.parts)) {
    return last.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
  }
  return typeof last.content === "string" ? last.content : ""
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const accessToken = await resolveAccessToken(session.user.id)

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const { agentId, conversationId: existingConversationId } = body
  if (!agentId) {
    return new Response("agentId required", { status: 400 })
  }

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) {
    return new Response("Agent not found", { status: 404 })
  }
  if (agent.workflowId === null) {
    return new Response(
      "Agent has no platform workflow yet — finish configuring it first",
      { status: 409 },
    )
  }

  const userMessage = extractUserMessage(body)
  if (!userMessage) {
    return new Response("No user message text found in request", { status: 400 })
  }

  const existingConversation = existingConversationId
    ? await db.query.conversations.findFirst({
        where: eq(conversations.id, existingConversationId),
      })
    : null

  const conversationId = existingConversationId ?? crypto.randomUUID()

  if (!existingConversation) {
    await db.insert(conversations).values({
      id: conversationId,
      agentId,
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

  // Open the platform Responses stream. `previous_response_id` carries
  // the stored response_id from the prior turn so the agent runtime
  // resumes its session memory (per `responses_v1.md` §7).
  const upstreamResponse = await fetch(
    `${PLATFORM_API_URL}/agent/${agent.workflowId}/responses`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oauth-access-token": accessToken,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: agent.model ?? "agent",
        input: userMessage,
        stream: true,
        previous_response_id: existingConversation?.sessionId ?? undefined,
      }),
    },
  )

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const errBody = await upstreamResponse.text().catch(() => "(no body)")
    return new Response(
      `Platform Responses error ${upstreamResponse.status}: ${errBody}`,
      { status: 502 },
    )
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await translateResponseStream(upstreamResponse.body!, {
        writer,
        conversationId,
      })

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: result.text,
        metadata: result.usage ? JSON.stringify({ usage: result.usage }) : null,
      })

      // Persist the platform-assigned response_id as the conversation's
      // sessionId so the next turn can pass it as `previous_response_id`
      // and chain agent memory.
      const newSessionId = result.responseId ?? existingConversation?.sessionId ?? null
      await db
        .update(conversations)
        .set({
          sessionId: newSessionId,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
    },
    onError: (error) => {
      console.error("Chat stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
  })

  return createUIMessageStreamResponse({ stream })
}
