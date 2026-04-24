import { auth } from "@/lib/auth"
import { db, getUserIdFromToken } from "@/lib/db"
import { agents, conversations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { runWorkflow } from "@/lib/platform/client"
import { streamJobSSE } from "@/lib/platform/sse"
import { extractAgentOutput } from "@/lib/platform/results"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// ── Auth ───────────────────────────────────────────────────────────────────────

async function resolveAccessToken(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }
  try {
    const tokenResult = await auth.api.getAccessToken({
      headers: request.headers,
      body: { providerId: "authentik" },
    })
    return (tokenResult as { accessToken?: string } | null)?.accessToken ?? null
  } catch {
    return null
  }
}

// ── OpenAI response builders ───────────────────────────────────────────────────

function makeChunkId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

function buildStreamChunk(
  id: string,
  model: string,
  delta: { role?: string; content?: string },
  finishReason: string | null,
  conversationId?: string
): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(conversationId ? { conversation_id: conversationId } : {}),
  })}\n\n`
}

function buildNonStreamResponse(
  id: string,
  model: string,
  content: string,
  promptTokens: number,
  completionTokens: number,
  conversationId: string
): Record<string, unknown> {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    conversation_id: conversationId,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  }
}

// ── Conversation helpers ───────────────────────────────────────────────────────

async function loadConversation(conversationId: string, agentId: string, userId: string) {
  return db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.agentId, agentId),
      eq(conversations.userId, userId)
    ),
  })
}

async function createConversation(agentId: string, userId: string) {
  const [created] = await db
    .insert(conversations)
    .values({ id: crypto.randomUUID(), agentId, userId, sessionId: null, title: "openai-api" })
    .returning()
  return created
}

async function persistSessionId(conversationId: string, sessionId: string) {
  await db
    .update(conversations)
    .set({ sessionId, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

// ── Result helpers ─────────────────────────────────────────────────────────────

function extractChunks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  const result = event.result as Record<string, unknown> | null | undefined
  return (
    ((result?.stream as Record<string, unknown> | null | undefined)
      ?.agent as Record<string, unknown> | null | undefined)
      ?.chunks as Array<Record<string, unknown>>
  ) ?? []
}

function isTerminal(event: Record<string, unknown>): boolean {
  return event.type === "done" || event.status === "completed" || event.status === "failed"
}


// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: agentId } = await params

  const accessToken = await resolveAccessToken(request)
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = await getUserIdFromToken(accessToken)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  }
  if (agent.workflowId === null) {
    return NextResponse.json({ error: "Agent has no platform workflow yet" }, { status: 409 })
  }

  let body: {
    messages?: Array<{ role: string; content: string }>
    model?: string
    stream?: boolean
    conversation_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { messages: chatMessages = [], model = "agent", stream = false } = body

  console.log("[openai-compat] raw body:", JSON.stringify(body, null, 2))
  console.log("[openai-compat] chatMessages count:", chatMessages.length)
  chatMessages.forEach((m, i) =>
    console.log(`[openai-compat] message[${i}]: role=${m.role} content=${JSON.stringify(m.content).slice(0, 200)}`)
  )

  const userMessage = [...chatMessages].reverse().find((m) => m.role === "user")?.content ?? ""
  console.log("[openai-compat] extracted userMessage:", JSON.stringify(userMessage))

  // Load existing conversation or create a new one
  let conversation
  if (body.conversation_id) {
    conversation = await loadConversation(body.conversation_id, agentId, userId)
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }
  } else {
    conversation = await createConversation(agentId, userId)
  }

  const job = await runWorkflow(
    agent.workflowId,
    { user_prompt: userMessage, session_id: conversation.sessionId ?? null },
    accessToken
  )

  const chunkId = makeChunkId()

  // ── Streaming ──────────────────────────────────────────────────────────────

  if (stream) {
    const encoder = new TextEncoder()

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // First chunk carries the conversation_id so the caller can store it
          controller.enqueue(
            encoder.encode(
              buildStreamChunk(chunkId, model, { role: "assistant", content: "" }, null, conversation.id)
            )
          )

          let lastChunkIndex = 0
          let finalResult: Record<string, unknown> | null | undefined = null

          for await (const event of streamJobSSE(job.id, accessToken)) {
            const chunks = extractChunks(event)
            // Only advance forward — see comment in app/api/chat/route.ts for
            // why `chunks` is non-monotonic across subagent handoffs.
            if (chunks.length > lastChunkIndex) {
              for (let i = lastChunkIndex; i < chunks.length; i++) {
                const content = (
                  chunks[i].choices as Array<{ delta?: { content?: string } }> | undefined
                )?.[0]?.delta?.content
                if (content) {
                  controller.enqueue(encoder.encode(buildStreamChunk(chunkId, model, { content }, null)))
                }
              }
              lastChunkIndex = chunks.length
            }

            if (isTerminal(event)) {
              finalResult = event.result as Record<string, unknown> | null | undefined
              break
            }
          }

          const newSessionId = extractAgentOutput(finalResult).sessionId
          if (newSessionId) {
            await persistSessionId(conversation.id, newSessionId)
          }

          controller.enqueue(encoder.encode(buildStreamChunk(chunkId, model, {}, "stop")))
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  // ── Non-streaming ──────────────────────────────────────────────────────────

  let fullContent = ""
  let promptTokens = 0
  let completionTokens = 0
  let lastChunkIndex = 0
  let finalResult: Record<string, unknown> | null | undefined = null

  for await (const event of streamJobSSE(job.id, accessToken)) {
    const chunks = extractChunks(event)
    // Only advance forward — see comment in app/api/chat/route.ts.
    if (chunks.length > lastChunkIndex) {
      for (let i = lastChunkIndex; i < chunks.length; i++) {
        const content = (
          chunks[i].choices as Array<{ delta?: { content?: string } }> | undefined
        )?.[0]?.delta?.content
        if (content) fullContent += content
      }
      lastChunkIndex = chunks.length
    }

    if (isTerminal(event)) {
      finalResult = event.result as Record<string, unknown> | null | undefined

      const output = extractAgentOutput(finalResult)
      const metadata = output.answer.metadata
      if (metadata) {
        promptTokens = (metadata.total_input_tokens as number | undefined) ?? 0
        completionTokens = (metadata.total_output_tokens as number | undefined) ?? 0
      }
      if (!fullContent && output.answer.content) {
        fullContent = output.answer.content
      }
      break
    }
  }

  const newSessionId = extractAgentOutput(finalResult).sessionId
  if (newSessionId) {
    await persistSessionId(conversation.id, newSessionId)
  }

  return NextResponse.json(
    buildNonStreamResponse(chunkId, model, fullContent, promptTokens, completionTokens, conversation.id)
  )
}
