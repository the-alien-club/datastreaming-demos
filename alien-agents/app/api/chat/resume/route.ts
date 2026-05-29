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

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { resumeResponsesStream } from "@/lib/platform/client"
import {
  translateResponseStream,
  type PlatformResponseResult,
} from "@/lib/platform/responses_stream"
import { conflict, notFound, unauthorized, err } from "@/lib/api-response"
import { resumeBodySchema, parseBody } from "../../_validators"
import { filterPersistableParts } from "@/lib/chat/persisted-parts"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const accessToken = await resolveAccessToken(session.user.id)

  const parsed = await parseBody(request, resumeBodySchema)
  if (parsed instanceof Response) return parsed
  const { conversationId: parsedConversationId, responseId, startingAfter } = parsed

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsedConversationId,
      userId: session.user.id,
    },
  })
  if (!conversation) return notFound("Conversation not found")

  const agent = await prisma.agent.findFirst({
    where: {
      id: conversation.agentId,
      OR: [{ userId: session.user.id }, { isPublic: true }],
    },
  })
  if (!agent) return notFound("Agent not found")
  if (agent.workflowId === null) {
    return conflict("Agent has no platform workflow yet")
  }

  const conversationId = conversation.id
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
    const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
    return err(`Platform Resume error: ${errBody}`, status)
  }

  // Mirror the POST route: capture the translator's result so the
  // background persistence branch can pull responseId/usage/text from
  // it after the chunk stream finishes.
  let translation: PlatformResponseResult | null = null

  const chunkStream = createUIMessageStream({
    execute: async ({ writer }) => {
      translation = await translateResponseStream(upstream.body!, {
        writer,
        conversationId,
        signal,
      })
    },
    onError: error => {
      console.error("Chat resume stream error:", error)
      return error instanceof Error ? error.message : "An error occurred"
    },
  })

  // Tee so we can drain one branch into the persisted-parts assembler
  // without blocking the SSE response. The original POST already wrote
  // a row when its turn completed normally — detect that via the
  // conversation's sessionId so we don't double-write on resume.
  const [forClient, forPersist] = chunkStream.tee()
  const alreadyPersisted = conversation.sessionId === responseId
  void persistResumedAssistantMessage({
    chunkStream: forPersist,
    conversationId,
    responseId,
    alreadyPersisted,
    getResult: () => translation,
  })

  return createUIMessageStreamResponse({ stream: forClient })
}

interface PersistResumeArgs {
  chunkStream: ReadableStream<UIMessageChunk>
  conversationId: string
  responseId: string
  alreadyPersisted: boolean
  getResult: () => PlatformResponseResult | null
}

/**
 * Drain the resume's tee'd chunk stream and persist the assistant turn —
 * but only when the original POST didn't already write it (detected via
 * `conversation.sessionId === responseId`) and only on clean terminations
 * (`result.ok` is true). Mirrors the POST-side persistence shape
 * (content + parts + metadata) so a second refresh recovers the same
 * rich rendering.
 */
async function persistResumedAssistantMessage({
  chunkStream,
  conversationId,
  responseId,
  alreadyPersisted,
  getResult,
}: PersistResumeArgs): Promise<void> {
  let assembled: UIMessage | undefined
  try {
    for await (const message of readUIMessageStream({ stream: chunkStream })) {
      assembled = message
    }
  } catch (e) {
    console.error("[chat/resume] failed to drain chunk stream:", e)
  }

  if (alreadyPersisted) return
  const result = getResult()
  // Only persist on clean termination — if the stream failed we don't
  // want to write a partial/error turn as the canonical assistant message.
  if (!result || !result.ok) return

  const persistedParts = filterPersistableParts(assembled?.parts)

  try {
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: result.text,
        // Prisma's Json field only accepts its internal InputJsonValue. Cast
        // through unknown: the runtime value is a plain JSON-serialisable array.
        parts: persistedParts.length > 0 ? (persistedParts as unknown as object) : undefined,
        metadata: result.usage ? JSON.stringify({ usage: result.usage }) : null,
      },
    })
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        sessionId: result.responseId ?? responseId,
        updatedAt: new Date(),
      },
    })
  } catch (e) {
    console.error("[chat/resume] failed to persist assistant message:", e)
  }
}
