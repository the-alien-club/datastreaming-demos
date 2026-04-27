// Translator: OpenAI Responses-API SSE → AI SDK UI message parts.
//
// The platform's `POST /agent/:id/responses` endpoint emits an
// OpenAI-Responses-conformant SSE stream per the spec at
// `web-app/packages/backend/lib/streaming/specs/responses_v1.md`.
// This module parses those events and writes corresponding parts to the
// AI SDK UI message stream consumed by `useChat()`.
//
// Mapping (only the events the chatbot UI cares about are handled;
// everything else is ignored — degradation per spec §7 of
// `chat_completions_v1.md`):
//
//   - `response.created`              → emits `data-conversationId`
//                                       (so the page can rewrite the URL)
//                                       AND captures `response_id` for
//                                       persistence as the next turn's
//                                       `previous_response_id`. Reads the
//                                       agent registry from
//                                       `Response.metadata.x_alien_agent_registry`
//                                       so subagent panels can surface
//                                       human-readable names.
//
//   - `response.output_item.added`    → if the item id encodes a non-root
//                                       agent (`agent:<aid>::*` per spec
//                                       §4) AND it's the first time we've
//                                       seen that agent in this turn,
//                                       emits a `data-subagent` part to
//                                       open a panel for the subagent's
//                                       activity.
//
//   - `response.output_text.delta`    → opens a text part (lazily, scoped
//                                       to the producing agent) and writes
//                                       a `text-delta` for each token.
//
//   - `response.function_call_arguments.done`
//                                     → emits `data-toolCall` so the UI
//                                       can render the tool chip
//                                       (matches the prior format).
//
//   - `response.completed`            → captures usage and finalises the
//                                       response_id; we close any open
//                                       text parts.
//
//   - `response.failed`               → captures the error code/message
//                                       and closes any open text parts.
//
// Parts emitted are AI SDK v6 UI message parts; consumers (`chat-ui.tsx`)
// type-guard them.

import type { createUIMessageStream } from "ai"

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

interface ResponseObject {
  id?: string
  status?: string
  metadata?: Record<string, string> | null
  usage?: Record<string, unknown> | null
  error?: { code?: string; message?: string } | null
}

export interface TranslatedResponseResult {
  /** Full assistant text concatenated from all `output_text.delta`s. */
  text: string
  /** The platform-assigned response_id (persist as next turn's previous_response_id). */
  responseId: string | null
  /** Token usage rolled up at terminal time. */
  usage: Record<string, unknown> | null
  /** Populated when the platform emitted `response.failed`. */
  error: { code: string; message: string } | null
}

export interface TranslateOptions {
  writer: StreamWriter
  conversationId: string
  /** Forward the request's abort signal so we can stop reading the upstream
   *  body when the client closes the tab mid-stream. The caller's fetch
   *  should be opened with the same signal so the upstream socket is also
   *  cancelled — the reader cancel here only releases our consumer side. */
  signal?: AbortSignal
}

/**
 * Read an OpenAI Responses-API SSE stream from `body` and translate
 * each event onto the AI SDK UI message stream `writer`.
 *
 * Returns the full assistant text plus the platform `response_id` so
 * the caller can persist them.
 */
export async function translateResponseStream(
  body: ReadableStream<Uint8Array>,
  opts: TranslateOptions,
): Promise<TranslatedResponseResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const state = new TranslationState(opts)

  // If the caller aborts (client disconnect mid-stream), cancel the reader
  // so the `await reader.read()` resolves immediately and we exit the loop.
  // The fetch initiated upstream by the caller should also have been opened
  // with the same signal — that's what actually closes the upstream socket.
  const onAbort = () => {
    reader.cancel(opts.signal?.reason ?? new Error("aborted")).catch(() => {})
  }
  if (opts.signal) {
    if (opts.signal.aborted) onAbort()
    else opts.signal.addEventListener("abort", onAbort, { once: true })
  }

  try {
    while (true) {
      if (opts.signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by blank lines. Each frame may carry an
      // `event:` line and one or more `data:` lines; per the Responses
      // spec we route by `event:` and treat `data:` as a single JSON
      // payload.
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")

        const parsed = parseSseFrame(frame)
        if (parsed) state.handleEvent(parsed.event, parsed.data)
      }
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
    state.finish()
  }

  return state.result()
}

/**
 * Parse one `text/event-stream` frame into `(event, data)`. Returns null
 * for comment-only frames (the platform sends `:keep-alive` heartbeats)
 * or frames whose data fails to parse as JSON.
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
      // SSE allows leading single space after the colon.
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

/**
 * Decode the `agent:<id>::<kind>_<n>` item-id prefix used by the
 * platform's Responses translator (see `responses_v1.md` §4) to embed
 * agent identity in the otherwise-opaque output item id. Returns null
 * for ids that don't carry a prefix (e.g. unrelated SDK shapes).
 */
function decodeAgentFromItemId(itemId: string | undefined): string | null {
  if (!itemId) return null
  const match = itemId.match(/^agent:([^:]+)::/)
  return match ? match[1] : null
}

/**
 * Stateful per-stream translator. Holds the current text-part id, the
 * set of subagents already announced to the UI, the agent registry
 * (parsed from `Response.metadata.x_alien_agent_registry`), and the
 * accumulated assistant text.
 */
class TranslationState {
  private readonly _writer: StreamWriter
  private readonly _conversationId: string

  /** Open text part id — null when no part is active. */
  private _textPartId: string | null = null
  /** Full text accumulated for Postgres persistence. */
  private _fullText: string = ""
  /** Subagents we've already opened panels for, by agent_id. */
  private readonly _announcedSubagents: Set<string> = new Set()
  /** Agent registry, keyed by agent_id. Populated from response.created metadata. */
  private readonly _registry: Map<string, AgentRegistryEntry> = new Map()
  /** Root agent id, parsed from `metadata.x_alien_root_agent_id`. */
  private _rootAgentId: string | null = null
  /** Platform-assigned response_id (carried on response.created/completed). */
  private _responseId: string | null = null
  /** Final usage block. */
  private _usage: Record<string, unknown> | null = null
  /** Error block, populated on response.failed. */
  private _error: { code: string; message: string } | null = null
  /** Has the conversationId been emitted to the UI yet. */
  private _conversationIdEmitted: boolean = false

  constructor(opts: TranslateOptions) {
    this._writer = opts.writer
    this._conversationId = opts.conversationId
  }

  handleEvent(event: string, data: unknown): void {
    if (typeof data !== "object" || data === null) return

    switch (event) {
      case "response.created":
        this._handleCreated(data as Record<string, unknown>)
        return
      case "response.output_item.added":
        this._handleOutputItemAdded(data as Record<string, unknown>)
        return
      case "response.output_text.delta":
        this._handleTextDelta(data as Record<string, unknown>)
        return
      case "response.function_call_arguments.done":
        this._handleFunctionCallDone(data as Record<string, unknown>)
        return
      case "response.completed":
        this._handleCompleted(data as Record<string, unknown>)
        return
      case "response.failed":
        this._handleFailed(data as Record<string, unknown>)
        return
      default:
        // Other events (in_progress, content_part.*, output_item.done,
        // reasoning_*, etc.) are not surfaced in the UI yet — see the
        // module docstring. Ignored intentionally.
        return
    }
  }

  /**
   * Close any open text part. Always safe to call multiple times.
   */
  finish(): void {
    this._closeTextPart()
  }

  result(): TranslatedResponseResult {
    return {
      text: this._fullText,
      responseId: this._responseId,
      usage: this._usage,
      error: this._error,
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  private _handleCreated(data: Record<string, unknown>): void {
    const responseObj = data.response as ResponseObject | undefined
    if (responseObj?.id) this._responseId = responseObj.id

    this._loadRegistryFromResponse(responseObj)

    // The chat-ui.tsx page expects `data-conversationId` early in the
    // stream so it can rewrite the URL. Emit it on the first event we
    // see (response.created is always seq 0).
    if (!this._conversationIdEmitted) {
      this._writer.write({
        type: "data-conversationId",
        data: this._conversationId,
      } as WriterEvent)
      this._conversationIdEmitted = true
    }
  }

  private _handleOutputItemAdded(data: Record<string, unknown>): void {
    const item = data.item as Record<string, unknown> | undefined
    const itemId = typeof item?.id === "string" ? item.id : undefined
    const agentId = decodeAgentFromItemId(itemId)
    if (!agentId) return

    // Skip the root agent — its content is the main assistant body and
    // doesn't need a panel announcement.
    if (this._rootAgentId !== null && agentId === this._rootAgentId) return
    if (this._announcedSubagents.has(agentId)) return

    const entry = this._registry.get(agentId)
    // Fall back to the agent_id as the display name when the registry
    // was truncated or didn't include this entry (per spec §4 the
    // registry is best-effort under the 512-char metadata cap).
    const displayName = entry?.name ?? agentId

    this._closeTextPart()
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

  private _handleTextDelta(data: Record<string, unknown>): void {
    const delta = data.delta
    if (typeof delta !== "string" || delta.length === 0) return
    this._writeTextDelta(delta)
  }

  private _handleFunctionCallDone(data: Record<string, unknown>): void {
    const name = typeof data.name === "string" ? data.name : null
    const argsStr = typeof data.arguments === "string" ? data.arguments : ""
    const itemId = typeof data.item_id === "string" ? data.item_id : crypto.randomUUID()
    if (!name) return

    let args: unknown = argsStr
    if (argsStr.trim().length > 0) {
      try {
        args = JSON.parse(argsStr)
      } catch {
        // Leave as raw string when arguments aren't valid JSON.
      }
    }

    this._closeTextPart()
    this._writer.write({
      type: "data-toolCall",
      data: { id: itemId, name, args },
    } as WriterEvent)
  }

  private _handleCompleted(data: Record<string, unknown>): void {
    const responseObj = data.response as ResponseObject | undefined
    if (responseObj?.id) this._responseId = responseObj.id
    if (responseObj?.usage) this._usage = responseObj.usage as Record<string, unknown>
    this._closeTextPart()
  }

  private _handleFailed(data: Record<string, unknown>): void {
    const responseObj = data.response as ResponseObject | undefined
    const err = responseObj?.error
    this._error = {
      code: typeof err?.code === "string" ? err.code : "server_error",
      message: typeof err?.message === "string" ? err.message : "Unknown error",
    }
    this._closeTextPart()
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Pull the agent registry off the `response.created` event's
   * `Response.metadata` per `responses_v1.md` §4. Tolerant of missing
   * or malformed entries — the spec guarantees the per-item id prefix
   * as the source of truth, so a missing registry only loses display
   * names, not subagent visibility.
   */
  private _loadRegistryFromResponse(response: ResponseObject | undefined): void {
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

  private _writeTextDelta(delta: string): void {
    if (this._textPartId === null) {
      this._textPartId = crypto.randomUUID()
      this._writer.write({ type: "text-start", id: this._textPartId } as WriterEvent)
    }
    this._writer.write({
      type: "text-delta",
      id: this._textPartId,
      delta,
    } as WriterEvent)
    this._fullText += delta
  }

  private _closeTextPart(): void {
    if (this._textPartId === null) return
    this._writer.write({ type: "text-end", id: this._textPartId } as WriterEvent)
    this._textPartId = null
  }
}
