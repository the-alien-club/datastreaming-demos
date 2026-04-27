// Mid-stream resume proxy: re-opens an interrupted Responses-API stream
// from the platform after a tab refresh. Used by the chat client's
// localStorage-backed reconnection path (see `existing-chat-client.tsx`).
//
// The platform's `GET /agent/:workflowId/responses/:respId?starting_after=<seq>`
// endpoint (responses_v1.md §5) replays every event with
// `sequence_number > startingAfter` and stays open if the response is
// still live. We translate that SSE stream onto the AI SDK UI message
// stream the same way the POST `/api/chat` route does, persist whatever
// completes after the resume, and return a `text/event-stream` the
// client consumes via `readUIMessageStream`.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { resumeResponsesStream } from "@/lib/platform/client"
import { translateResponseStream } from "@/lib/platform/responses_stream"
import { badRequest, conflict, notFound, unauthorized } from "@/lib/api-response"

export const dynamic = "force-dynamic"

interface ResumeRequestBody {
  conversationId?: string
  responseId?: string
  startingAfter?: number
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const accessToken = await resolveAccessToken(session.user.id)

  let body: ResumeRequestBody
  try {
    body = (await request.json()) as ResumeRequestBody
  } catch {
    return badRequest("Invalid JSON body")
  }

  if (!body.conversationId) return badRequest("conversationId required")
  if (!body.responseId) return badRequest("responseId required")
  if (typeof body.startingAfter !== "number" || !Number.isInteger(body.startingAfter) || body.startingAfter < 0) {
    return badRequest("startingAfter must be a non-negative integer")
  }
  const startingAfter = body.startingAfter

  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, body.conversationId),
      eq(conversations.userId, session.user.id),
    ),
  })
  if (!conversation) return notFound("Conversation not found")

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, conversation.agentId), eq(agents.userId, session.user.id)),
  })
  if (!agent) return notFound("Agent not found")
  if (agent.workflowId === null) {
    return conflict("Agent has no platform workflow yet")
  }

  const conversationId = conversation.id
  const responseId = body.responseId
  const signal = request.signal

  const upstream = await resumeResponsesStream(
    agent.workflowId,
    responseId,
    startingAfter,
    accessToken,
    signal,
  )

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.text().catch(() => "(no body)")
    return new Response(`Platform Resume error ${upstream.status}: ${errBody}`, {
      status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
    })
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await translateResponseStream(upstream.body!, { writer, conversationId, signal })

      // Only persist on a clean terminal completion. Mid-stream aborts
      // (refresh again during resume) leave the previously-persisted
      // assistant row untouched — the next resume will pick up from
      // wherever the platform's response store stands.
      if (result.error !== null) return

      // The original POST `/api/chat` route already wrote the assistant
      // row at the original turn's terminal event. If the abort happened
      // before that write, persist now. We detect "already persisted"
      // by looking for an assistant message tied to this responseId
      // via the conversation sessionId — when the original turn
      // completed normally, sessionId was already updated.
      const alreadyPersisted = conversation.sessionId === responseId
      if (alreadyPersisted) return

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: result.text,
        metadata: result.usage ? JSON.stringify({ usage: result.usage }) : null,
      })

      await db
        .update(conversations)
        .set({
          sessionId: result.responseId ?? responseId,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
    },
    onError: error => {
      console.error("Chat resume stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
  })

  return createUIMessageStreamResponse({ stream })
}
