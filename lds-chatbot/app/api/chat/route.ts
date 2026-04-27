// Thin auth proxy: forwards a chat turn to the platform's OpenAI
// Responses-API endpoint and translates its SSE event stream into AI
// SDK UI message parts for `useChat()`. Persists user/assistant
// messages and the per-conversation `response_id` to SQLite so each
// turn resumes the agent's session memory.
//
// The platform endpoint (`POST /agent/:workflowId/responses`) is OpenAI
// Responses-API stream-conformant per
// `web-app/packages/backend/lib/streaming/specs/responses_v1.md`.
// All translation logic lives in `lib/platform/responses_stream.ts`.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { openResponsesStream } from "@/lib/platform/client"
import { translateResponseStream } from "@/lib/platform/responses_stream"

export const dynamic = "force-dynamic"

interface ChatRequestBody {
  messages?: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; content?: string }>
  agentId?: string
  conversationId?: string
}

function extractUserMessage(body: ChatRequestBody): string {
  const last = body.messages?.[body.messages.length - 1]
  if (!last) return ""
  if (Array.isArray(last.parts)) {
    return last.parts.filter(p => p.type === "text").map(p => p.text ?? "").join("")
  }
  return typeof last.content === "string" ? last.content : ""
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return new Response("Unauthorized", { status: 401 })

  const accessToken = await resolveAccessToken(session.user.id)

  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  if (!body.agentId) return new Response("agentId required", { status: 400 })

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) })
  if (!agent) return new Response("Agent not found", { status: 404 })
  if (agent.workflowId === null) {
    return new Response("Agent has no platform workflow yet — finish configuring it first", { status: 409 })
  }

  const userMessage = extractUserMessage(body)
  if (!userMessage) return new Response("No user message text found in request", { status: 400 })

  const existingConversation = body.conversationId
    ? await db.query.conversations.findFirst({ where: eq(conversations.id, body.conversationId) })
    : null

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

  // `previous_response_id` carries the prior turn's response_id so the
  // agent runtime resumes its session memory (responses_v1.md §7).
  const upstream = await openResponsesStream(
    agent.workflowId,
    {
      model: agent.model ?? "agent",
      input: userMessage,
      previous_response_id: existingConversation?.sessionId ?? undefined,
    },
    accessToken,
  )

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.text().catch(() => "(no body)")
    return new Response(`Platform Responses error ${upstream.status}: ${errBody}`, { status: 502 })
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await translateResponseStream(upstream.body!, { writer, conversationId })

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: result.text,
        metadata: result.usage ? JSON.stringify({ usage: result.usage }) : null,
      })

      // Persist the platform response_id as the conversation's sessionId
      // so the next turn passes it as `previous_response_id`.
      await db
        .update(conversations)
        .set({
          sessionId: result.responseId ?? existingConversation?.sessionId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
    },
    onError: error => {
      console.error("Chat stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
  })

  return createUIMessageStreamResponse({ stream })
}
