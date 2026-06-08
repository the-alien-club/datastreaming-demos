import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { nanoid } from "nanoid"
import { NextResponse } from "next/server"
import { processQuery } from "@/lib/claude-sdk/agent-query"
import { jobStore } from "@/lib/claude-sdk/job-store"
import { env } from "@/lib/env"
import { platformProvider, runPlatformResponse } from "@/lib/platform/responses_stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatMessage = { role: "user" | "assistant"; content: string }
type Body = {
  mode: "data" | "agentic"
  messages: ChatMessage[]
  model?: string
}

/**
 * Mode A — Agentic flow. Streams the platform workflow's Responses API via
 * AI SDK v6 `createUIMessageStream` and emits UI message chunks (text deltas,
 * tool-input-available, data-toolCall ripple events, data-subagent panels,
 * finish). The client decodes these chunks and drives the cross-panel
 * choreography.
 *
 * Mode B — Data flow. Starts a Claude Agent SDK background job and returns
 * { jobId } for polling via /api/demo/status/[jobId].
 */
export async function POST(request: Request): Promise<Response> {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body?.mode || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const userPrompt = extractUserMessage(body.messages)
  if (!userPrompt) {
    return NextResponse.json({ error: "No user message text found" }, { status: 400 })
  }

  if (body.mode === "agentic") {
    return streamAgenticTurn(userPrompt, request.signal)
  }

  if (body.mode === "data") {
    const jobId = nanoid()
    jobStore.create(jobId)
    void processQuery(jobId, body.messages, body.model ?? "claude-opus-4-7")
    return NextResponse.json({ jobId, status: "started" })
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 })
}

function extractUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "user" && typeof m.content === "string" && m.content.length > 0) {
      return m.content
    }
  }
  return ""
}

function streamAgenticTurn(prompt: string, signal: AbortSignal): Response {
  // Resolve env eagerly so missing config returns a structured JSON 503
  // instead of a generic 500 from the streaming response. The client uses
  // the 503 as the trigger to fall back to the scripted runner.
  let platformBase: string
  let workflowId: string
  let oat: string
  try {
    platformBase = env.PLATFORM_API_URL.replace(/\/$/, "")
    workflowId = env.DEMO_WORKFLOW_ID
    oat = env.ADMIN_OAT
  } catch (err) {
    return NextResponse.json(
      {
        error: "platform-env-missing",
        message:
          "Mode A requires PLATFORM_API_URL, DEMO_WORKFLOW_ID, and ADMIN_OAT. " +
          "Fill in .env to enable the live platform workflow.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    )
  }

  const provider = platformProvider({
    baseURL: `${platformBase}/agent/${workflowId}`,
    accessToken: oat,
  })

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      await runPlatformResponse({ provider, prompt, writer, signal })
    },
    onError: (error) => {
      console.error("[mode-a] stream error:", error)
      return error instanceof Error ? error.message : "Stream error"
    },
  })

  return createUIMessageStreamResponse({ stream })
}
