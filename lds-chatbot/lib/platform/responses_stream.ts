// Native AI SDK integration for the platform's OpenAI Responses API.
//
// The platform's `POST /agent/:id/responses` endpoint is OpenAI
// Responses-API-stream-conformant (spec at
// `web-app/packages/backend/lib/streaming/specs/responses_v1.md`).
// Rather than a bespoke SSE parser we use `@ai-sdk/openai`'s
// `createOpenAI` provider — configured with the platform's OAuth header
// and pointed at the platform base URL — and drive it through AI SDK v6
// `streamText`.
//
// Architecture: single-pass over fullStream
//
// We iterate `result.fullStream` exactly once, handling both UI parts
// (text-start/delta/end, tool-input-start/delta/available, start/finish)
// and platform extensions (raw events, tool-call sidecar) in the same
// loop. This avoids the tee-based two-consumer approach:
//
//   PROBLEM: StreamTextResult.teeStream() is stateful and mutates
//   `this.baseStream` on every call. Accessing both `result.fullStream`
//   and `result.toUIMessageStream()` creates two tees. Under Node.js
//   ReadableStream backpressure semantics, both halves of a tee must be
//   consumed for either to advance. Running them in parallel async-for
//   loops causes deadlock — the microtask queue serialises the two loops
//   so they can't interleave, and the tee buffer fills and blocks.
//
//   FIX: iterate fullStream once. Translate TextStreamPart variants to
//   UIMessageChunk manually, and run the sidecar (raw / tool-call
//   platform extensions) in the same iteration.
//
// Four platform-specific `data-*` parts emitted by the sidecar:
//
//   data-conversationId  — emitted once at start; lets the page rewrite
//                          its URL before any text arrives.
//   data-subagent        — emitted the first time a non-root agent's
//                          output item appears (via raw events); drives
//                          the subagent panel announcement.
//   data-toolCall        — emitted on `tool-call` fullStream parts;
//                          carries `{ id, name, args }` in the legacy
//                          chip shape the chat UI expects.
//   data-streamProgress  — emitted on every raw event with a
//                          `sequence_number`; transient; drives the
//                          client-side localStorage resume cursor.

import { createOpenAI } from "@ai-sdk/openai"
import { streamText, type createUIMessageStream } from "ai"

// ── Types ────────────────────────────────────────────────────────────────────

type StreamWriter = Parameters<
  Parameters<typeof createUIMessageStream>[0]["execute"]
>[0]["writer"]

type WriterEvent = StreamWriter extends { write: (e: infer E) => unknown }
  ? E
  : never

interface AgentRegistryEntry {
  id: string
  kind: "main" | "subagent" | "tool"
  name: string
  parent_id: string | null
  dispatched_by_tool_call_id?: string
}

/** Raw shape emitted by the platform on `response.created`. */
interface ResponseCreatedPayload {
  id?: string
  status?: string
  metadata?: Record<string, string> | null
}

/** Minimal shape of a `response.output_item.added` item field. */
interface OutputItem {
  id?: string
  type?: string
}

export interface PlatformResponseResult {
  /** Full assistant text concatenated from all text-delta events. */
  text: string
  /** Platform-assigned response_id; persist as next turn's previous_response_id. */
  responseId: string | null
  /** Token usage rolled up at terminal time. */
  usage: Record<string, unknown> | null
  /** True when the stream completed without error. */
  ok: boolean
}

// ── Provider factory ─────────────────────────────────────────────────────────

export interface PlatformProviderOptions {
  /**
   * Platform API base URL for this specific agent workflow:
   * `${PLATFORM_API_URL}/agent/${workflowId}`.
   * The Responses provider appends `/responses` automatically.
   */
  baseURL: string
  /** Authentik access token forwarded as `x-oauth-access-token`. */
  accessToken: string
}

/**
 * Construct an `@ai-sdk/openai` provider pointed at the platform's
 * Responses-API endpoint for a given agent workflow. The OAuth guard
 * on the platform ignores the API key; the real auth flows via the
 * `x-oauth-access-token` header.
 */
export function platformProvider(
  opts: PlatformProviderOptions,
): ReturnType<typeof createOpenAI> {
  return createOpenAI({
    baseURL: opts.baseURL,
    apiKey: "unused",
    headers: {
      "authorization": `Bearer ${opts.accessToken}`,
      "x-oauth-access-token": opts.accessToken,
    },
  })
}

// ── Stream runner ─────────────────────────────────────────────────────────────

export interface RunPlatformResponseOptions {
  provider: ReturnType<typeof createOpenAI>
  prompt: string
  previousResponseId?: string
  writer: StreamWriter
  conversationId: string
  signal?: AbortSignal
}

/**
 * Drive a single streaming Responses-API turn through AI SDK `streamText`.
 *
 * Iterates `result.fullStream` in a single pass — writing UI parts
 * (text, tool-input, start/finish) directly to `writer` and extracting
 * platform extensions (subagent announcements, progress beacons, tool chips)
 * via a sidecar state machine in the same loop.
 *
 * Returns a settled result carrying the accumulated text, `responseId`, and
 * usage so the caller can persist the turn.
 */
export async function runPlatformResponse(
  opts: RunPlatformResponseOptions,
): Promise<PlatformResponseResult> {
  const { provider, prompt, previousResponseId, writer, conversationId, signal } = opts

  const result = streamText({
    model: provider.responses("agent"),
    prompt,
    includeRawChunks: true,
    abortSignal: signal,
    ...(previousResponseId !== undefined && previousResponseId !== null
      ? { providerOptions: { openai: { previousResponseId } } }
      : {}),
  })

  // Emit data-conversationId immediately so the page can rewrite its URL
  // before the first text token arrives.
  writer.write({
    type: "data-conversationId",
    data: conversationId,
  } as WriterEvent)

  const sidecarState = new SidecarState(writer)

  // Single pass: one iterator over fullStream. TextStreamPart variants are
  // translated to UIMessageChunk and written; `raw` parts and `tool-call`
  // parts feed the sidecar. No tee, no parallel consumers, no deadlock.
  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start":
          writer.write({ type: "start" } as WriterEvent)
          break

        case "text-start":
          writer.write({ type: "text-start", id: part.id } as WriterEvent)
          sidecarState.trackText(part.id)
          break

        case "text-delta":
          writer.write({ type: "text-delta", id: part.id, delta: part.text } as WriterEvent)
          sidecarState.accumulateText(part.text)
          break

        case "text-end":
          writer.write({ type: "text-end", id: part.id } as WriterEvent)
          break

        case "tool-input-start":
          // TextStreamPart uses `id`; UIMessageChunk uses `toolCallId`.
          writer.write({
            type: "tool-input-start",
            toolCallId: part.id,
            toolName: part.toolName,
          } as WriterEvent)
          break

        case "tool-input-delta":
          // TextStreamPart uses `delta`; UIMessageChunk uses `inputTextDelta`.
          writer.write({
            type: "tool-input-delta",
            toolCallId: part.id,
            inputTextDelta: part.delta,
          } as WriterEvent)
          break

        case "tool-input-end":
          // tool-input-end has no matching UIMessageChunk — the native
          // tool-input-available fires on tool-call which supersedes it.
          // No-op: the tool-call case below handles the completion event.
          break

        case "tool-call": {
          // TextStreamPart.tool-call carries `input` (not `args`).
          // Write native tool-input-available chunk for the AI SDK UI renderer.
          const toolInput = "input" in part ? (part as { input: unknown }).input : undefined
          writer.write({
            type: "tool-input-available",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: toolInput,
          } as WriterEvent)
          // Also emit the legacy data-toolCall chip the chat UI expects.
          sidecarState.handleToolCall(part.toolCallId, part.toolName, toolInput)
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
          // Platform extension events: subagent announcements, progress beacons.
          sidecarState.handleRawPart(part.rawValue)
          break

        default:
          // start-step, reasoning-*, source-*, file — not surfaced in UI yet.
          break
      }
    }
  } catch (err) {
    // Surface transport/parse errors as error chunks so the client can
    // display them rather than hanging on an empty stream.
    writer.write({
      type: "error",
      errorText: err instanceof Error ? err.message : String(err),
    } as WriterEvent)
  }

  return sidecarState.result()
}

// ── Sidecar state machine ────────────────────────────────────────────────────

class SidecarState {
  private readonly _writer: StreamWriter

  private _responseId: string | null = null
  private _usage: Record<string, unknown> | null = null
  private _ok: boolean = false
  private _fullText: string = ""
  private _rootAgentId: string | null = null
  private _hasOpenTextPart: boolean = false

  private readonly _registry: Map<string, AgentRegistryEntry> = new Map()
  private readonly _announcedSubagents: Set<string> = new Set()

  constructor(writer: StreamWriter) {
    this._writer = writer
  }

  // ── Text tracking ──────────────────────────────────────────────────────────

  trackText(_partId: string): void {
    this._hasOpenTextPart = true
  }

  accumulateText(delta: string): void {
    this._fullText += delta
  }

  // ── Raw event handler ──────────────────────────────────────────────────────

  handleRawPart(rawValue: unknown): void {
    if (typeof rawValue !== "object" || rawValue === null) return
    const payload = rawValue as Record<string, unknown>

    const eventType = typeof payload.type === "string" ? payload.type : null
    if (eventType === null) return

    const seqNum = payload.sequence_number
    const hasSeq = typeof seqNum === "number" && Number.isInteger(seqNum)

    switch (eventType) {
      case "response.created": {
        const response = payload.response as ResponseCreatedPayload | undefined
        if (response?.id) this._responseId = response.id
        this._loadRegistry(response)
        break
      }
      case "response.output_item.added": {
        const item = payload.item as OutputItem | undefined
        this._maybeAnnounceSubagent(item?.id)
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

    if (hasSeq && this._responseId !== null) {
      const terminal =
        eventType === "response.completed" ||
        eventType === "response.failed" ||
        eventType === "response.incomplete"

      this._writer.write({
        type: "data-streamProgress",
        transient: true,
        data: {
          responseId: this._responseId,
          sequenceNumber: seqNum as number,
          terminal,
        },
      } as WriterEvent)
    }
  }

  // ── Tool-call handler ──────────────────────────────────────────────────────

  handleToolCall(toolCallId: string, toolName: string, args: unknown): void {
    this._writer.write({
      type: "data-toolCall",
      data: { id: toolCallId, name: toolName, args },
    } as WriterEvent)
  }

  // ── Registry helpers ───────────────────────────────────────────────────────

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
        dispatched_by_tool_call_id:
          typeof e.dispatched_by_tool_call_id === "string"
            ? e.dispatched_by_tool_call_id
            : undefined,
      })
    }
  }

  private _decodeAgentFromItemId(itemId: string | undefined): string | null {
    if (!itemId) return null
    const match = itemId.match(/^agent:([^:]+)::/)
    return match ? (match[1] ?? null) : null
  }

  private _maybeAnnounceSubagent(itemId: string | undefined): void {
    const agentId = this._decodeAgentFromItemId(itemId)
    if (!agentId) return
    if (this._rootAgentId !== null && agentId === this._rootAgentId) return
    if (this._announcedSubagents.has(agentId)) return

    const entry = this._registry.get(agentId)
    const displayName = entry?.name ?? agentId

    this._writer.write({
      type: "data-subagent",
      data: {
        agentId,
        name: displayName,
        kind: entry?.kind ?? "subagent",
        parentId: entry?.parent_id ?? null,
        dispatchedByToolCallId: entry?.dispatched_by_tool_call_id ?? null,
      },
    } as WriterEvent)
    this._announcedSubagents.add(agentId)
  }

  // ── Result accessor ────────────────────────────────────────────────────────

  result(): PlatformResponseResult {
    return {
      text: this._fullText,
      responseId: this._responseId,
      usage: this._usage,
      ok: this._ok,
    }
  }
}

// ── Resume-path SSE translator ───────────────────────────────────────────────
//
// The mid-stream resume endpoint (`GET /agent/:id/responses/:respId?starting_after=<seq>`)
// returns a raw SSE body in the same Responses-API event format. We cannot
// drive it through `streamText` (which always POSTs) so the resume route
// in `app/api/chat/resume/route.ts` calls `translateResponseStream` directly
// with the raw body from `resumeResponsesStream`.

export interface TranslateOptions {
  writer: StreamWriter
  conversationId: string
  /** Forward the request's abort signal to cancel the upstream body reader. */
  signal?: AbortSignal
}

/**
 * Read an OpenAI Responses-API SSE stream from `body` and translate
 * each event onto the AI SDK UI message stream `writer`.
 *
 * Used by the resume route. Returns the settled result so the caller
 * can persist the completed turn.
 */
export async function translateResponseStream(
  body: ReadableStream<Uint8Array>,
  opts: TranslateOptions,
): Promise<PlatformResponseResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const state = new SidecarState(opts.writer)

  // Emit data-conversationId so the client can rewrite its URL on resume.
  opts.writer.write({
    type: "data-conversationId",
    data: opts.conversationId,
  } as WriterEvent)

  const onAbort = (): void => {
    reader.cancel(opts.signal?.reason ?? new Error("aborted")).catch(() => {})
  }
  if (opts.signal) {
    if (opts.signal.aborted) onAbort()
    else opts.signal.addEventListener("abort", onAbort, { once: true })
  }

  try {
    // Track open text parts: keyed by output item id → AI SDK text-part id.
    const openTextParts = new Map<string, string>()

    while (true) {
      if (opts.signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")

        const parsed = parseSseFrame(frame)
        if (!parsed) continue

        const { event, data } = parsed
        if (typeof data !== "object" || data === null) continue
        const payload = data as Record<string, unknown>

        // Delegate to SidecarState for platform extensions.
        state.handleRawPart(payload)

        // Translate the text and tool events to UIMessageChunk.
        switch (event) {
          case "response.output_text.delta": {
            const delta = payload.delta
            const itemId = typeof payload.item_id === "string" ? payload.item_id : null
            if (typeof delta === "string" && delta.length > 0 && itemId !== null) {
              let partId = openTextParts.get(itemId)
              if (partId === undefined) {
                partId = crypto.randomUUID()
                openTextParts.set(itemId, partId)
                opts.writer.write({ type: "text-start", id: partId } as WriterEvent)
              }
              opts.writer.write({ type: "text-delta", id: partId, delta } as WriterEvent)
              state.accumulateText(delta)
            }
            break
          }
          case "response.output_item.done": {
            const item = payload.item as Record<string, unknown> | undefined
            const itemId = typeof item?.id === "string" ? item.id : null
            if (itemId !== null) {
              const partId = openTextParts.get(itemId)
              if (partId !== undefined) {
                opts.writer.write({ type: "text-end", id: partId } as WriterEvent)
                openTextParts.delete(itemId)
              }
            }
            break
          }
          case "response.function_call_arguments.done": {
            const name = typeof payload.name === "string" ? payload.name : null
            const argsStr = typeof payload.arguments === "string" ? payload.arguments : ""
            const callId =
              typeof payload.item_id === "string" ? payload.item_id : crypto.randomUUID()
            if (name !== null) {
              let args: unknown = argsStr
              if (argsStr.trim().length > 0) {
                try {
                  args = JSON.parse(argsStr)
                } catch {
                  // Leave as raw string when arguments aren't valid JSON.
                }
              }
              state.handleToolCall(callId, name, args)
            }
            break
          }
          default:
            break
        }
      }
    }

    // Close any text parts that didn't receive an output_item.done.
    for (const [, partId] of openTextParts) {
      opts.writer.write({ type: "text-end", id: partId } as WriterEvent)
    }
    openTextParts.clear()
  } finally {
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }

  return state.result()
}

/**
 * Parse one `text/event-stream` frame into `(event, data)`. Returns null
 * for comment-only frames or frames whose data fails JSON parsing.
 */
function parseSseFrame(frame: string): { event: string; data: unknown } | null {
  let event = ""
  const dataLines: string[] = []

  for (const rawLine of frame.split("\n")) {
    if (rawLine.startsWith(":") || rawLine.length === 0) continue
    if (rawLine.startsWith("event:")) {
      event = rawLine.slice(6).trim()
      continue
    }
    if (rawLine.startsWith("data:")) {
      dataLines.push(rawLine.slice(5).replace(/^ /, ""))
    }
  }

  if (!event || dataLines.length === 0) return null

  const dataStr = dataLines.join("\n")
  try {
    return { event, data: JSON.parse(dataStr) as unknown }
  } catch {
    return null
  }
}
