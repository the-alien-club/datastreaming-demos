// Mode A — Agentic flow. Forwards a chat turn to the platform's
// OpenAI Responses-API endpoint and translates the resulting fullStream into
// AI SDK v6 UI message chunks for the client.
//
// Ported from `alien-agents/lib/platform/responses_stream.ts`. Stripped:
//   - resume-path SSE translator (translateResponseStream)
//   - data-conversationId emit (no conversation table here)
//   - data-streamProgress (no resume cursor)
//   - subagentNames lookup (no agent metadata; subagent panels still fire,
//     they just show the raw agent id as the name)
//   - TTFT diagnostic logging
//
// The four platform-specific data parts that DO matter for the cross-panel
// choreography:
//   - data-toolCall      — fires the ripple (datasources / APIs / counters /
//                          tape / attribution). Carries { id, name, args }.
//   - data-subagent      — drives the rail node panel in Agentic flow.
//   - data-subagent-end  — closes the panel back to MAIN.

import { createOpenAI } from "@ai-sdk/openai"
import { type createUIMessageStream, smoothStream, streamText } from "ai"

// Platform-internal subagent dispatch strings must never reach the UI. The
// platform occasionally emits `Task(description="...", subagent_type="...")`
// as a text-delta when an orchestrator delegates to a subagent. These are
// internal control signals, not user-visible content.
const TASK_DISPATCH_RE = /^Task\(description=["'].*?["'],\s*subagent_type=["'].*?["']\)\s*$/

// ── Types ────────────────────────────────────────────────────────────────────

type StreamWriter = Parameters<Parameters<typeof createUIMessageStream>[0]["execute"]>[0]["writer"]
type WriterEvent = StreamWriter extends { write: (e: infer E) => unknown } ? E : never

interface AgentRegistryEntry {
  id: string
  kind: "main" | "subagent" | "tool"
  name: string
  parent_id: string | null
}

interface ResponseCreatedPayload {
  id?: string
  status?: string
  metadata?: Record<string, string> | null
}

interface OutputItem {
  id?: string
  type?: string
}

export interface PlatformResponseResult {
  text: string
  responseId: string | null
  usage: Record<string, unknown> | null
  ok: boolean
}

// ── Provider factory ─────────────────────────────────────────────────────────

export interface PlatformProviderOptions {
  /**
   * Platform base URL for this specific agent workflow:
   * `${PLATFORM_API_URL}/agent/${workflowId}`. The Responses provider appends
   * `/responses` automatically.
   */
  baseURL: string
  /** Admin OAT forwarded as `Authorization: Bearer`. */
  accessToken: string
}

export function platformProvider(opts: PlatformProviderOptions): ReturnType<typeof createOpenAI> {
  return createOpenAI({
    baseURL: opts.baseURL,
    apiKey: "unused",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      "x-oauth-access-token": opts.accessToken,
    },
  })
}

// ── Stream runner ────────────────────────────────────────────────────────────

export interface RunPlatformResponseOptions {
  provider: ReturnType<typeof createOpenAI>
  prompt: string
  writer: StreamWriter
  signal?: AbortSignal
}

/**
 * Drive a single streaming Responses-API turn through AI SDK `streamText`.
 * Iterates `result.fullStream` once — TextStreamPart variants are translated
 * to UIMessageChunk and written; `raw` parts and `tool-call` parts feed the
 * sidecar in the same loop (no tee, no parallel consumers, no deadlock).
 */
export async function runPlatformResponse(
  opts: RunPlatformResponseOptions,
): Promise<PlatformResponseResult> {
  const { provider, prompt, writer, signal } = opts

  const result = streamText({
    model: provider.responses("agent"),
    prompt,
    includeRawChunks: true,
    abortSignal: signal,
    experimental_transform: smoothStream({ delayInMs: 20, chunking: "word" }),
  })

  const sidecar = new SidecarState(writer)

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start":
          writer.write({ type: "start" } as WriterEvent)
          break

        case "text-start":
          writer.write({ type: "text-start", id: part.id } as WriterEvent)
          break

        case "text-delta": {
          if (TASK_DISPATCH_RE.test(part.text.trim())) break
          writer.write({
            type: "text-delta",
            id: part.id,
            delta: part.text,
          } as WriterEvent)
          sidecar.accumulateText(part.text)
          break
        }

        case "text-end":
          writer.write({ type: "text-end", id: part.id } as WriterEvent)
          break

        case "tool-input-start":
          writer.write({
            type: "tool-input-start",
            toolCallId: part.id,
            toolName: part.toolName,
          } as WriterEvent)
          break

        case "tool-input-delta":
          writer.write({
            type: "tool-input-delta",
            toolCallId: part.id,
            inputTextDelta: part.delta,
          } as WriterEvent)
          break

        case "tool-input-end":
          // No-op: tool-call below emits tool-input-available.
          break

        case "tool-call": {
          const toolInput = "input" in part ? (part as { input: unknown }).input : undefined
          writer.write({
            type: "tool-input-available",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: toolInput,
          } as WriterEvent)
          // Custom chip — drives the cross-panel ripple on the client.
          sidecar.handleToolCall(part.toolCallId, part.toolName, toolInput)
          break
        }

        case "finish":
          writer.write({
            type: "finish",
            finishReason: part.finishReason,
          } as WriterEvent)
          break

        case "finish-step":
          writer.write({ type: "finish-step" } as WriterEvent)
          break

        case "error":
          writer.write({
            type: "error",
            errorText: part.error instanceof Error ? part.error.message : String(part.error),
          } as WriterEvent)
          break

        case "raw":
          sidecar.handleRawPart(part.rawValue)
          break

        default:
          break
      }
    }
  } catch (err) {
    writer.write({
      type: "error",
      errorText: err instanceof Error ? err.message : String(err),
    } as WriterEvent)
  }

  return sidecar.result()
}

// ── Sidecar state machine ────────────────────────────────────────────────────

class SidecarState {
  private readonly _writer: StreamWriter

  private _responseId: string | null = null
  private _usage: Record<string, unknown> | null = null
  private _ok = false
  private _fullText = ""
  private _rootAgentId: string | null = null
  private _activeSubagentId: string | null = null
  private readonly _registry = new Map<string, AgentRegistryEntry>()

  constructor(writer: StreamWriter) {
    this._writer = writer
  }

  accumulateText(delta: string): void {
    this._fullText += delta
  }

  handleRawPart(rawValue: unknown): void {
    if (typeof rawValue !== "object" || rawValue === null) return
    const payload = rawValue as Record<string, unknown>
    const eventType = typeof payload.type === "string" ? payload.type : null
    if (eventType === null) return

    switch (eventType) {
      case "response.created": {
        const response = payload.response as ResponseCreatedPayload | undefined
        if (response?.id) this._responseId = response.id
        this._loadRegistry(response)
        break
      }
      case "response.output_item.added": {
        const item = payload.item as OutputItem | undefined
        this._maybeAnnounceSubagent(item?.id, item?.type)
        break
      }
      case "response.completed": {
        const response = payload.response as
          | { id?: string; usage?: Record<string, unknown> | null }
          | undefined
        if (response?.id) this._responseId = response.id
        if (response?.usage) this._usage = response.usage
        this._ok = true
        break
      }
      case "response.failed":
        this._ok = false
        break
      default:
        break
    }
  }

  handleToolCall(toolCallId: string, toolName: string, args: unknown): void {
    this._writer.write({
      type: "data-toolCall",
      data: { id: toolCallId, name: toolName, args },
    } as WriterEvent)
  }

  private _loadRegistry(response: ResponseCreatedPayload | undefined): void {
    const metadata = response?.metadata
    if (!metadata) return
    const root = metadata.x_alien_root_agent_id
    if (typeof root === "string") this._rootAgentId = root

    const raw = metadata.x_alien_agent_registry
    if (typeof raw !== "string" || raw.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!Array.isArray(parsed)) return

    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue
      const e = entry as Record<string, unknown>
      const id = e.id
      const name = e.name
      const kind = e.kind
      if (typeof id !== "string" || typeof name !== "string") continue
      if (kind !== "main" && kind !== "subagent" && kind !== "tool") continue
      this._registry.set(id, {
        id,
        name,
        kind,
        parent_id: typeof e.parent_id === "string" ? e.parent_id : null,
      })
    }
  }

  private _decodeAgentFromItemId(itemId: string | undefined): string | null {
    if (!itemId) return null
    const match = itemId.match(/^agent:([^:]+)::/)
    return match ? (match[1] ?? null) : null
  }

  private _maybeAnnounceSubagent(itemId: string | undefined, itemType?: string): void {
    const agentId = this._decodeAgentFromItemId(itemId)
    if (!agentId) return
    if (this._rootAgentId !== null && agentId === this._rootAgentId) {
      // Tool calls are attributed to MAIN in item IDs even when logically
      // dispatched by a subagent — only close the fold for message items.
      if (itemType !== "function_call" && this._activeSubagentId !== null) {
        this._writer.write({ type: "data-subagent-end", data: {} } as WriterEvent)
        this._activeSubagentId = null
      }
      return
    }
    if (this._activeSubagentId === agentId) return

    const entry = this._registry.get(agentId)
    const displayName = entry?.name ?? agentId
    this._writer.write({
      type: "data-subagent",
      data: {
        agentId,
        name: displayName,
        kind: entry?.kind ?? "subagent",
        parentId: entry?.parent_id ?? null,
      },
    } as WriterEvent)
    this._activeSubagentId = agentId
  }

  result(): PlatformResponseResult {
    return {
      text: this._fullText,
      responseId: this._responseId,
      usage: this._usage,
      ok: this._ok,
    }
  }
}
