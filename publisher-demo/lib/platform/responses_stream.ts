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
  call_id?: string
  name?: string
  status?: string
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
  /** Numeric organization id pinned via `x-organization-id`. */
  orgId: string
}

export function platformProvider(opts: PlatformProviderOptions): ReturnType<typeof createOpenAI> {
  return createOpenAI({
    baseURL: opts.baseURL,
    apiKey: "unused",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      "x-oauth-access-token": opts.accessToken,
      "x-organization-id": opts.orgId,
    },
  })
}

// ── Stream runner ────────────────────────────────────────────────────────────

export interface RunPlatformResponseOptions {
  provider: ReturnType<typeof createOpenAI>
  prompt: string
  writer: StreamWriter
  signal?: AbortSignal
  /**
   * Platform `response_id` from the previous turn in this Mode A chat. When
   * supplied, the platform threads the new turn against the same agent
   * runtime session (planner/specialist/critic memory + tool history). Send
   * `undefined` for the first turn or after a reset.
   */
  previousResponseId?: string
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
  const { provider, prompt, writer, signal, previousResponseId } = opts

  const tStart = Date.now()
  const ms = (t0: number) => `${Date.now() - t0}ms`
  console.log(
    `[mode-a ▶] runPlatformResponse start promptLen=${prompt.length} signal.aborted=${signal?.aborted ?? false} previousResponseId=${previousResponseId ?? "—"}`,
  )

  const result = streamText({
    model: provider.responses("agent"),
    prompt,
    includeRawChunks: true,
    abortSignal: signal,
    experimental_transform: smoothStream({ delayInMs: 20, chunking: "word" }),
    // Thread multi-turn memory on the platform side. When omitted the platform
    // starts a fresh agent runtime session.
    ...(previousResponseId
      ? { providerOptions: { openai: { previousResponseId } } }
      : {}),
  })

  const sidecar = new SidecarState(writer)
  let tFirstByte = 0
  let tFirstText = 0
  // Per-event-type counters for the end-of-stream summary.
  const counts: Record<string, number> = {}
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1
  }

  try {
    for await (const part of result.fullStream) {
      if (tFirstByte === 0) {
        tFirstByte = Date.now()
        console.log(`[mode-a ⏱ ]   ttfb ${tFirstByte - tStart}ms (first fullStream part)`)
      }
      bump(part.type)
      switch (part.type) {
        case "start":
          console.log(`[mode-a srv] start`)
          writer.write({ type: "start" } as WriterEvent)
          break

        case "start-step":
          // AI SDK v6 step boundary marker. No client-side analogue; we just
          // log it for diagnostic flow.
          console.log(`[mode-a srv] start-step`)
          break

        case "text-start":
          console.log(`[mode-a srv] text-start id=${part.id}`)
          writer.write({ type: "text-start", id: part.id } as WriterEvent)
          break

        case "text-delta": {
          if (TASK_DISPATCH_RE.test(part.text.trim())) {
            console.log(`[mode-a srv] text-delta SKIPPED (Task() dispatch noise) id=${part.id}`)
            break
          }
          if (tFirstText === 0) {
            tFirstText = Date.now()
            console.log(`[mode-a ⏱ ]   ttft ${tFirstText - tStart}ms (first text-delta)`)
          }
          writer.write({
            type: "text-delta",
            id: part.id,
            delta: part.text,
          } as WriterEvent)
          sidecar.accumulateText(part.text)
          break
        }

        case "text-end":
          console.log(`[mode-a srv] text-end id=${part.id}`)
          writer.write({ type: "text-end", id: part.id } as WriterEvent)
          break

        case "tool-input-start":
          console.log(`[mode-a srv] tool-input-start id=${part.id} tool=${part.toolName}`)
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
          console.log(`[mode-a srv] tool-input-end id=${part.id}`)
          // No-op: tool-call below emits tool-input-available.
          break

        case "tool-call": {
          const toolInput = "input" in part ? (part as { input: unknown }).input : undefined
          const inputLen = toolInput ? JSON.stringify(toolInput).length : 0
          console.log(
            `[mode-a srv] tool-call id=${part.toolCallId} tool=${part.toolName} inputLen=${inputLen}`,
          )
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
          console.log(
            `[mode-a srv] finish reason=${part.finishReason} total=${ms(tStart)} ttfb=${tFirstByte ? tFirstByte - tStart : "—"}ms`,
          )
          writer.write({
            type: "finish",
            finishReason: part.finishReason,
          } as WriterEvent)
          break

        case "finish-step":
          console.log(`[mode-a srv] finish-step`)
          writer.write({ type: "finish-step" } as WriterEvent)
          break

        case "error":
          console.error(
            `[mode-a srv] error part:`,
            part.error instanceof Error ? part.error.stack ?? part.error.message : part.error,
          )
          writer.write({
            type: "error",
            errorText: part.error instanceof Error ? part.error.message : String(part.error),
          } as WriterEvent)
          break

        case "raw":
          sidecar.handleRawPart(part.rawValue)
          break

        default:
          console.log(`[mode-a srv] unknown fullStream part.type=${String(part.type)}`)
          break
      }
    }
  } catch (err) {
    console.error(
      `[mode-a srv] EXCEPTION in fullStream loop after ${ms(tStart)}:`,
      err instanceof Error ? err.stack ?? err.message : err,
    )
    writer.write({
      type: "error",
      errorText: err instanceof Error ? err.message : String(err),
    } as WriterEvent)
  }

  const summary = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  console.log(`[mode-a ⏱ ] runPlatformResponse done total=${ms(tStart)} parts: ${summary}`)
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
  // Platform emits response.output_item.done for function_call items BEFORE
  // the AI SDK's fullStream surfaces the synthetic `tool-call` part for the
  // same call_id. If we wrote tool-output-available immediately, the client
  // would see the result event before the call, and the tool card would never
  // settle. We hold completions here and flush them when handleToolCall fires.
  private readonly _emittedCallIds = new Set<string>()
  private readonly _pendingOutputs = new Map<string, OutputItem>()
  // Platform-side function_call items carry the dispatching subagent in
  // their item.id (e.g. `agent:subagent-specialist::fc_7`). The AI SDK
  // `tool-call` fullStream part doesn't expose that — it only carries the
  // call_id. We snapshot the author at output_item.added time so handleToolCall
  // can tag the outbound `data-toolCall` with the right subagent.
  private readonly _toolCallAuthor = new Map<string, string>()
  // Per-event-type counters across the whole turn. Dumped from `result()` so
  // the dev log has a final tally next to the AI SDK fullStream tally.
  private readonly _rawCounts = new Map<string, number>()
  private _subagentEmits = 0
  private _subagentEndEmits = 0

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
    this._rawCounts.set(eventType, (this._rawCounts.get(eventType) ?? 0) + 1)

    switch (eventType) {
      case "response.created": {
        const response = payload.response as ResponseCreatedPayload | undefined
        const meta = response?.metadata ?? {}
        console.log(
          `[mode-a raw] response.created id=${response?.id} status=${response?.status} jobId=${meta.x_alien_job_id} rootAgent=${meta.x_alien_root_agent_id}`,
        )
        if (response?.id) this._responseId = response.id
        this._loadRegistry(response)
        this._maybeEmitJobId(response)
        this._maybeEmitResponseId(response)
        break
      }
      case "response.in_progress":
        // Heartbeat from the platform. Don't log every one; just count.
        break
      case "response.cost_breakdown": {
        // Platform-specific event written by the backend immediately before
        // `response.completed`. Forward the assembled CostBreakdown payload
        // to the client so the orchestrator hook can replay it through the
        // royalty cascade. Schema: lib/cost_breakdown_types.ts on the backend.
        const jobId = typeof payload.job_id === "number" ? payload.job_id : null
        const costBreakdown = payload.cost_breakdown
        if (jobId === null || typeof costBreakdown !== "object" || costBreakdown === null) {
          console.warn(
            `[mode-a raw] cost_breakdown SKIPPED jobId=${jobId} cbType=${typeof costBreakdown}`,
          )
          break
        }
        const cb = costBreakdown as Record<string, unknown>
        const keys = Object.keys(cb).join(",")
        console.log(
          `[mode-a raw] cost_breakdown jobId=${jobId} keys=[${keys}] sample=${JSON.stringify(cb).slice(0, 400)}`,
        )
        this._writer.write({
          type: "data-costBreakdown",
          data: { jobId, costBreakdown },
        } as WriterEvent)
        break
      }
      case "response.output_item.added": {
        const item = payload.item as OutputItem | undefined
        console.log(
          `[mode-a raw] output_item.added id=${item?.id} type=${item?.type} call_id=${item?.call_id ?? "—"} name=${item?.name ?? "—"}`,
        )
        this._maybeAnnounceSubagent(item?.id, item?.type)
        // Snapshot author for function_call items so handleToolCall can tag
        // the outbound data-toolCall with the right subagent.
        if (item?.type === "function_call" && typeof item.call_id === "string") {
          const author = this._decodeAuthorFromItemId(item.id)
          if (author) {
            this._toolCallAuthor.set(item.call_id, author)
            console.log(
              `[mode-a raw]   ↳ tracked toolCall ${item.call_id} author=${author}`,
            )
          }
        }
        break
      }
      case "response.output_item.done": {
        const item = payload.item as OutputItem | undefined
        console.log(
          `[mode-a raw] output_item.done id=${item?.id} type=${item?.type} call_id=${item?.call_id ?? "—"} status=${item?.status ?? "—"}`,
        )
        if (item?.type === "function_call" && typeof item.call_id === "string") {
          if (this._emittedCallIds.has(item.call_id)) {
            console.log(`[mode-a raw]   ↳ flush IMMEDIATE tool-output for ${item.call_id}`)
            this._emitToolOutput(item)
          } else {
            console.log(`[mode-a raw]   ↳ DEFER tool-output for ${item.call_id} until tool-call`)
            this._pendingOutputs.set(item.call_id, item)
          }
        }
        break
      }
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.output_text.delta":
      case "response.output_text.done":
      case "response.function_call_arguments.delta":
      case "response.function_call_arguments.done":
        // High-frequency events; let the count summary cover them.
        break
      case "response.completed": {
        const response = payload.response as
          | { id?: string; usage?: Record<string, unknown> | null }
          | undefined
        const usage = response?.usage ?? null
        const usageStr = usage
          ? `in=${(usage as Record<string, unknown>).input_tokens ?? "?"} out=${(usage as Record<string, unknown>).output_tokens ?? "?"}`
          : "—"
        console.log(`[mode-a raw] response.completed id=${response?.id} usage:${usageStr}`)
        if (response?.id) this._responseId = response.id
        if (response?.usage) this._usage = response.usage
        this._ok = true
        break
      }
      case "response.failed": {
        // Full payload, no truncation — error context is critical here.
        const response = payload.response as
          | { id?: string; status?: string; error?: unknown; metadata?: Record<string, string> }
          | undefined
        const errMeta = response?.metadata ?? {}
        console.error(
          `[mode-a raw] ✗ response.failed id=${response?.id} status=${response?.status}`,
        )
        console.error(`[mode-a raw]   error_code=${errMeta.x_alien_error_code ?? "—"}`)
        console.error(`[mode-a raw]   error_message=${errMeta.x_alien_error_message ?? "—"}`)
        console.error(`[mode-a raw]   job_id=${errMeta.x_alien_job_id ?? "—"}`)
        console.error(`[mode-a raw]   response.error=${JSON.stringify(response?.error)}`)
        console.error(`[mode-a raw]   FULL PAYLOAD=${JSON.stringify(payload)}`)
        this._ok = false
        break
      }
      case "response.incomplete":
        console.warn(`[mode-a raw] response.incomplete payload=${JSON.stringify(payload).slice(0, 400)}`)
        break
      default:
        console.log(`[mode-a raw] (uncategorized) ${eventType}`)
        break
    }
  }

  handleToolCall(toolCallId: string, toolName: string, args: unknown): void {
    const author = this._toolCallAuthor.get(toolCallId) ?? null
    console.log(
      `[mode-a srv] → data-toolCall id=${toolCallId} tool=${toolName} author=${author ?? "—"}`,
    )
    this._writer.write({
      type: "data-toolCall",
      data: { id: toolCallId, name: toolName, args, author },
    } as WriterEvent)
    this._emittedCallIds.add(toolCallId)
    const pending = this._pendingOutputs.get(toolCallId)
    if (pending) {
      console.log(`[mode-a srv]   ↳ flushing pending tool-output for ${toolCallId}`)
      this._pendingOutputs.delete(toolCallId)
      this._emitToolOutput(pending)
    }
  }

  private _emitToolOutput(item: OutputItem): void {
    if (typeof item.call_id !== "string") return
    const author = this._toolCallAuthor.get(item.call_id) ?? null
    console.log(
      `[mode-a srv] → tool-output-available + data-toolResult id=${item.call_id} status=${item.status ?? "completed"} author=${author ?? "—"}`,
    )
    this._writer.write({
      type: "tool-output-available",
      toolCallId: item.call_id,
      output: { status: item.status ?? "completed" },
    } as WriterEvent)
    this._writer.write({
      type: "data-toolResult",
      data: {
        id: item.call_id,
        name: item.name ?? null,
        status: item.status ?? "completed",
        author,
      },
    } as WriterEvent)
  }

  private _decodeAuthorFromItemId(itemId: string | undefined): string | null {
    if (!itemId) return null
    const m = itemId.match(/^agent:([^:]+)::/)
    if (!m) return null
    const raw = m[1] ?? ""
    if (raw === "MAIN") return "main"
    return raw.replace(/^subagent-/, "")
  }

  private _emittedJobId: boolean = false
  private _emittedResponseId: boolean = false

  private _maybeEmitJobId(response: ResponseCreatedPayload | undefined): void {
    if (this._emittedJobId) return
    const raw = response?.metadata?.x_alien_job_id
    if (typeof raw !== "string" || raw.length === 0) return
    const jobId = Number.parseInt(raw, 10)
    if (!Number.isFinite(jobId)) return
    console.log(`[mode-a srv] → data-jobId ${jobId}`)
    this._writer.write({
      type: "data-jobId",
      data: { jobId },
    } as WriterEvent)
    this._emittedJobId = true
  }

  private _maybeEmitResponseId(response: ResponseCreatedPayload | undefined): void {
    if (this._emittedResponseId) return
    const id = response?.id
    if (typeof id !== "string" || id.length === 0) return
    console.log(`[mode-a srv] → data-responseId ${id}`)
    this._writer.write({
      type: "data-responseId",
      data: { responseId: id },
    } as WriterEvent)
    this._emittedResponseId = true
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
        console.log(
          `[mode-a srv] → data-subagent-end (was active: ${this._activeSubagentId}, MAIN took over via ${itemType})`,
        )
        this._writer.write({ type: "data-subagent-end", data: {} } as WriterEvent)
        this._subagentEndEmits += 1
        this._activeSubagentId = null
      }
      return
    }
    if (this._activeSubagentId === agentId) return

    const entry = this._registry.get(agentId)
    const displayName = entry?.name ?? agentId
    console.log(
      `[mode-a srv] → data-subagent agentId=${agentId} name=${displayName} kind=${entry?.kind ?? "subagent"} (prev active=${this._activeSubagentId ?? "none"})`,
    )
    this._writer.write({
      type: "data-subagent",
      data: {
        agentId,
        name: displayName,
        kind: entry?.kind ?? "subagent",
        parentId: entry?.parent_id ?? null,
      },
    } as WriterEvent)
    this._subagentEmits += 1
    this._activeSubagentId = agentId
  }

  result(): PlatformResponseResult {
    const rawSummary = Array.from(this._rawCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")
    const pendingCount = this._pendingOutputs.size
    console.log(
      `[mode-a srv] ─── SidecarState result ──────────────────────`,
    )
    console.log(`[mode-a srv]   ok=${this._ok} textLen=${this._fullText.length}`)
    console.log(`[mode-a srv]   responseId=${this._responseId}`)
    console.log(`[mode-a srv]   usage=${this._usage ? JSON.stringify(this._usage) : "—"}`)
    console.log(
      `[mode-a srv]   subagent emits=${this._subagentEmits} ends=${this._subagentEndEmits}`,
    )
    console.log(
      `[mode-a srv]   tool calls tracked=${this._toolCallAuthor.size} pending outputs=${pendingCount}`,
    )
    if (pendingCount > 0) {
      console.warn(
        `[mode-a srv]   ⚠ ${pendingCount} pending tool-output(s) NEVER FLUSHED (tool-call from AI SDK never arrived for these call_ids):`,
      )
      for (const [callId, item] of this._pendingOutputs) {
        console.warn(`[mode-a srv]      - ${callId} (${item.name ?? "—"})`)
      }
    }
    console.log(`[mode-a srv]   raw event tally: ${rawSummary}`)
    console.log(
      `[mode-a srv]   text preview=${JSON.stringify(this._fullText.slice(0, 200))}${this._fullText.length > 200 ? "…" : ""}`,
    )
    console.log(`[mode-a srv] ──────────────────────────────────────────────`)
    return {
      text: this._fullText,
      responseId: this._responseId,
      usage: this._usage,
      ok: this._ok,
    }
  }
}
