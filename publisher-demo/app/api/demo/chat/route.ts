import { createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { NextResponse } from "next/server"
import { streamModeB, type StreamedToolEvent } from "@/lib/claude-sdk/agent-query"
import { env } from "@/lib/env"
import { adminFetch } from "@/lib/platform/admin-fetch"
import { resolveConfig } from "@/lib/platform/resolve-slug"
import { platformProvider, runPlatformResponse } from "@/lib/platform/responses_stream"

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatMessage = { role: "user" | "assistant"; content: string }
type Body = {
  mode: "data" | "agentic"
  messages: ChatMessage[]
  model?: string
  /**
   * Mode A multi-turn: previous turn's platform `response_id` so the
   * orchestrator threads the new prompt against the same agent runtime
   * session (planner/specialist/critic memory + tool history). Omitted on
   * the first turn or after a reset.
   */
  previousResponseId?: string
}

/**
 * Mode A — Agentic flow. Streams the platform workflow's Responses API via
 * AI SDK v6 `createUIMessageStream`.
 *
 * Mode B — Data flow. Streams from the official Anthropic Messages API with
 * the MCP-connector beta. Returns NDJSON over `text/event-stream`; each event
 * is a JSON-encoded `StreamedToolEvent`.
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
    return streamAgenticTurn(userPrompt, body.previousResponseId, request.signal)
  }

  if (body.mode === "data") {
    return streamDataTurn(body, request.signal)
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 })
}

async function streamDataTurn(body: Body, signal: AbortSignal): Promise<Response> {
  const resolved = await resolveConfig().catch(() => null)
  if (!resolved) {
    return NextResponse.json(
      {
        error: "no-mcp-configuration",
        message:
          "No MCP configuration found on the platform for the admin OAT. " +
          "Mode B needs a configuration to point the MCP connector at.",
      },
      { status: 404 },
    )
  }

  // Catalog → system prompt context so the agent knows which clusters /
  // connectors it's actually allowed to touch.
  const sourcesRes = await adminFetch("/mcp-configurations/available-sources")
  const sources = sourcesRes.ok
    ? await unwrap<{
        clusters: Array<{ name: string }>
        external_apis: Array<{ name: string }>
      }>(sourcesRes)
    : { clusters: [], external_apis: [] }

  // Sonnet 4.6 is materially faster than Opus 4.7 on this workload (the
  // bottleneck is summarising large MCP tool results — ~20s on Opus, ~7s on
  // Sonnet — at comparable quality). Override via body.model if needed.
  const model = body.model ?? "claude-sonnet-4-6"
  const promptContext = {
    configSlug: resolved.slug,
    configName: resolved.configuration.name,
    clusterNames: sources.clusters.map((c) => c.name),
    connectorNames: sources.external_apis.map((a) => a.name),
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamedToolEvent): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        for await (const event of streamModeB(
          body.messages,
          model,
          resolved.slug,
          promptContext,
          signal,
        )) {
          send(event)
          if (event.type === "message-stop") break
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
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

function streamAgenticTurn(
  prompt: string,
  previousResponseId: string | undefined,
  signal: AbortSignal,
): Response {
  const tRoute = Date.now()
  // Resolve env eagerly so missing config returns a structured JSON 503
  // instead of a generic 500 from the streaming response. The client uses
  // the 503 as the trigger to fall back to the scripted runner.
  let platformBase: string
  let workflowId: string
  let oat: string
  let orgId: string
  try {
    platformBase = env.PLATFORM_API_URL.replace(/\/$/, "")
    workflowId = env.DEMO_WORKFLOW_ID
    oat = env.ADMIN_OAT
    orgId = env.ORG_ID
  } catch (err) {
    console.error(`[mode-a route] ✗ env missing: ${err instanceof Error ? err.message : err}`)
    return NextResponse.json(
      {
        error: "platform-env-missing",
        message:
          "Mode A requires PLATFORM_API_URL, DEMO_WORKFLOW_ID, ADMIN_OAT and ORG_ID. " +
          "Fill in .env to enable the live platform workflow.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    )
  }
  console.log(
    `[mode-a route] ▶ streamAgenticTurn workflow=${workflowId} org=${orgId} promptLen=${prompt.length} previousResponseId=${previousResponseId ?? "—"}`,
  )
  console.log(`[mode-a route]   platform=${platformBase}/agent/${workflowId}/responses`)
  console.log(`[mode-a route]   signal.aborted=${signal.aborted}`)
  // Observe the abort signal so we know whether the client disconnected
  // mid-stream — that's a common cause of "platform call ran fine but UI
  // shows nothing" failures.
  signal.addEventListener("abort", () => {
    console.warn(
      `[mode-a route] ⚠ AbortSignal fired ${Date.now() - tRoute}ms into the turn (client disconnect?)`,
    )
  })

  const provider = platformProvider({
    baseURL: `${platformBase}/agent/${workflowId}`,
    accessToken: oat,
    orgId,
  })

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const r = await runPlatformResponse({
          provider,
          prompt,
          writer,
          signal,
          previousResponseId,
        })
        console.log(
          `[mode-a route] ◀ runPlatformResponse returned ok=${r.ok} responseId=${r.responseId} textLen=${r.text.length} elapsed=${Date.now() - tRoute}ms`,
        )
      } catch (err) {
        console.error(
          `[mode-a route] ✗ runPlatformResponse THREW after ${Date.now() - tRoute}ms:`,
          err instanceof Error ? err.stack ?? err.message : err,
        )
        throw err
      }
    },
    onError: (error) => {
      console.error(
        `[mode-a route] ✗ createUIMessageStream onError:`,
        error instanceof Error ? error.stack ?? error.message : error,
      )
      return error instanceof Error ? error.message : "Stream error"
    },
  })

  return createUIMessageStreamResponse({ stream })
}
