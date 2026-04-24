import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { runWorkflow } from "@/lib/platform/client"
import { streamJobSSE } from "@/lib/platform/sse"
import { extractAgentOutput } from "@/lib/platform/results"
import { resolveAccessToken } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

type WriterEvent = Parameters<
  Parameters<typeof createUIMessageStream>[0]["execute"]
>[0]["writer"] extends { write: (e: infer E) => unknown }
  ? E
  : never

interface PlatformToolCall {
  id?: string
  type?: string
  index?: number
  function?: {
    name?: string
    arguments?: string
  }
}

interface PlatformChunkDelta {
  content?: string
  role?: string
  tool_calls?: PlatformToolCall[]
}

interface PlatformChunkChoice {
  delta?: PlatformChunkDelta
  finish_reason?: string | null
  index?: number
}

interface PlatformChunk {
  id?: string
  model?: string
  agent_context?: string
  choices?: PlatformChunkChoice | PlatformChunkChoice[]
}

function firstChoice(chunk: PlatformChunk): PlatformChunkChoice | undefined {
  const choices = chunk.choices
  if (!choices) return undefined
  return Array.isArray(choices) ? choices[0] : choices
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const accessToken = await resolveAccessToken(session.user.id)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const { messages: chatMessages, agentId, conversationId: existingConversationId } = body as {
    messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; content?: string }>
    agentId?: string
    conversationId?: string
  }

  if (!agentId) {
    return new Response("agentId required", { status: 400 })
  }

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) {
    return new Response("Agent not found", { status: 404 })
  }
  if (agent.workflowId === null) {
    return new Response("Agent has no platform workflow yet — finish configuring it first", { status: 409 })
  }

  const existingConversation = existingConversationId
    ? await db.query.conversations.findFirst({
        where: eq(conversations.id, existingConversationId),
      })
    : null

  // Extract the user's text from the last message (AI SDK v6 uses parts)
  const lastMsg = chatMessages?.[chatMessages?.length - 1]
  let userMessage = ""
  if (lastMsg) {
    if (lastMsg.parts && Array.isArray(lastMsg.parts)) {
      userMessage = lastMsg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("")
    } else if (typeof lastMsg.content === "string") {
      userMessage = lastMsg.content
    }
  }

  if (!userMessage) {
    return new Response("No user message text found in request", { status: 400 })
  }

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

  const job = await runWorkflow(
    agent.workflowId,
    {
      user_prompt: userMessage,
      session_id: existingConversation?.sessionId ?? null,
    },
    accessToken
  )

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Send the conversationId as a typed data chunk so the client can redirect
      writer.write({
        type: "data-conversationId",
        data: conversationId,
      } as WriterEvent)

      let lastChunkIndex = 0
      let fullContent = ""
      let finalSessionId: string | null = null
      let finalMetadata: Record<string, unknown> | null = null

      // Text-part lifecycle: lazily opened so tool calls emitted before any
      // text don't create an empty leading text part. Closed before each tool
      // call so parts render in chronological order.
      let textPartId: string | null = null
      const openTextPart = () => {
        if (textPartId) return
        textPartId = crypto.randomUUID()
        writer.write({ type: "text-start", id: textPartId } as WriterEvent)
      }
      const closeTextPart = () => {
        if (!textPartId) return
        writer.write({ type: "text-end", id: textPartId } as WriterEvent)
        textPartId = null
      }
      const writeTextDelta = (delta: string) => {
        openTextPart()
        writer.write({ type: "text-delta", id: textPartId!, delta } as WriterEvent)
        fullContent += delta
      }

      // Dedupe tool calls by their LLM-assigned id — the platform re-sends the
      // same tool_call entry across cumulative chunks, we only want to emit once.
      const emittedToolCallIds = new Set<string>()
      const emitToolCall = (tc: PlatformToolCall) => {
        const tcId = tc.id
        const fnName = tc.function?.name
        if (!tcId || !fnName || emittedToolCallIds.has(tcId)) return
        emittedToolCallIds.add(tcId)

        let args: unknown = tc.function?.arguments
        if (typeof args === "string" && args.trim().length > 0) {
          try {
            args = JSON.parse(args)
          } catch {
            // leave as raw string if unparseable
          }
        }

        closeTextPart()
        writer.write({
          type: "data-toolCall",
          data: { id: tcId, name: fnName, args },
        } as WriterEvent)
      }

      for await (const event of streamJobSSE(job.id, accessToken)) {
        const result = event.result as Record<string, unknown> | null | undefined
        const streamAll = result?.stream as Record<string, unknown> | undefined
        const streamBlock = streamAll?.agent as Record<string, unknown> | null | undefined
        const chunks = (streamBlock?.chunks as PlatformChunk[] | undefined) ?? []

        // `chunks` is NOT monotonic across a run: when a subagent takes over
        // the platform swaps a shorter array in, then swaps the main agent's
        // longer array back in. Only advance on forward motion — never rewind
        // `lastChunkIndex`, otherwise a swing like 125 → 1 → 309 would replay
        // 124 already-emitted deltas and the UI shows duplicated lines.
        // TODO: remove this workaround once the worker writes per-agent chunk
        // streams under distinct keys instead of sharing stream.agent.chunks.
        if (chunks.length > lastChunkIndex) {
          for (let i = lastChunkIndex; i < chunks.length; i++) {
            const chunk = chunks[i]
            const choice = firstChoice(chunk)
            const delta = choice?.delta
            if (!delta) continue

            if (delta.content) {
              writeTextDelta(delta.content)
            }
            if (delta.tool_calls && delta.tool_calls.length > 0) {
              for (const tc of delta.tool_calls) emitToolCall(tc)
            }
          }
          lastChunkIndex = chunks.length
        }

        const eventType = event.type as string | undefined
        const eventStatus = event.status as string | undefined

        if (
          eventType === "done" ||
          eventStatus === "completed" ||
          eventStatus === "failed"
        ) {
          const output = extractAgentOutput(result)
          finalSessionId = output.sessionId
          finalMetadata = output.answer.metadata

          // Non-streaming fallback: some runs return the full answer only at
          // terminal, with no incremental text-delta chunks.
          if (!fullContent && output.answer.content) {
            writeTextDelta(output.answer.content)
          }
          break
        }
      }

      closeTextPart()

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId,
        role: "assistant",
        content: fullContent,
        metadata: finalMetadata ? JSON.stringify(finalMetadata) : null,
      })

      await db
        .update(conversations)
        .set({
          sessionId: finalSessionId ?? existingConversation?.sessionId ?? null,
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
