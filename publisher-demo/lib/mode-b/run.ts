/**
 * Mode B — Data flow stream consumer.
 *
 * Talks to `/api/demo/chat` with `mode: "data"`, reads NDJSON-over-SSE frames
 * of `StreamedToolEvent` (emitted by the client-side Anthropic tool-use loop
 * in `lib/claude-sdk/agent-query.ts`), and dispatches a narrow callback
 * surface back into the orchestrator hook.
 *
 * Owned entirely by this file:
 * - The fetch + AbortController lifecycle (with cancelRef polling)
 * - The word-rate text/thinking smoother (typewriter feel)
 * - The pendingInputs map for accumulating tool-use input JSON
 *
 * All hook state (messages, tool dispatch ref, royalty pipeline, event bus)
 * is reached only via the callback surface. Editing Mode B here cannot
 * break Mode A.
 */
import type { StreamedToolEvent } from "@/lib/claude-sdk/agent-query"
import { demoFetch } from "@/lib/client/demo-fetch"

export interface ChatHistoryMessage {
  role: "user" | "assistant"
  content: string
}

export interface ModeBCallbacks {
  /** A word of assistant text arrived (smoother output). */
  onAssistantText: (delta: string) => void
  /** A word of thinking arrived (smoother output). */
  onThinkingText: (delta: string) => void
  /** A new tool call started — register it in the dispatch table. */
  onToolUseStart: (toolUseId: string, toolName: string) => void
  /** Tool input JSON finished assembling. Args may be null if parse failed. */
  onToolUseInputResolved: (toolUseId: string, args: Record<string, unknown> | null) => void
  /** Tool finished. Settle the card and fire the royalty cascade. */
  onToolResult: (toolUseId: string, content: unknown, isError: boolean) => void
  /** Per-message usage from Anthropic. */
  onUsage: (usage: { inputTokens: number; outputTokens: number }) => void
  /** Stream-level error event. Append failure marker to the assistant message. */
  onError: (message: string) => void
  /** Stream finished (success, cancel, or error). Final cleanup. */
  onStreamEnd: () => void
}

export interface ModeBRunOptions {
  query: string
  /** Pre-built history (the hook owns messagesRef; we don't reach into it). */
  history: ChatHistoryMessage[]
  cancelRef: { readonly current: boolean }
  callbacks: ModeBCallbacks
}

export async function runModeB(opts: ModeBRunOptions): Promise<void> {
  const { query, history, cancelRef, callbacks } = opts

  const controller = new AbortController()
  // Poll cancelRef and abort fetch when the user resets / switches mode.
  const cancelTimer = window.setInterval(() => {
    if (cancelRef.current) controller.abort()
  }, 250)

  // Per-tool accumulator for streamed input_json_delta fragments.
  const pendingInputs = new Map<string, string>()

  // Word-rate smoothing for text/thinking deltas. LLM tokens arrive in jagged
  // bursts; we release them one word at a time on a 25ms tick so the typewriter
  // feel is smooth. Non-text events flush synchronously to preserve ordering.
  const smoother = {
    textBuf: "",
    thinkingBuf: "",
    timer: null as number | null,
  }
  const drainOne = (key: "textBuf" | "thinkingBuf"): string | null => {
    const buf = smoother[key]
    if (!buf) return null
    const m = /^\s*\S+\s?/.exec(buf)
    const chunk = m ? m[0] : buf.slice(0, 8)
    smoother[key] = buf.slice(chunk.length)
    return chunk
  }
  const startDrainer = () => {
    if (smoother.timer) return
    smoother.timer = window.setInterval(() => {
      if (!smoother.textBuf && !smoother.thinkingBuf) {
        if (smoother.timer) window.clearInterval(smoother.timer)
        smoother.timer = null
        return
      }
      const thinkingChunk = drainOne("thinkingBuf")
      if (thinkingChunk) callbacks.onThinkingText(thinkingChunk)
      const textChunk = drainOne("textBuf")
      if (textChunk) callbacks.onAssistantText(textChunk)
    }, 25)
  }
  const flushBuffers = () => {
    if (smoother.textBuf) {
      callbacks.onAssistantText(smoother.textBuf)
      smoother.textBuf = ""
    }
    if (smoother.thinkingBuf) {
      callbacks.onThinkingText(smoother.thinkingBuf)
      smoother.thinkingBuf = ""
    }
  }

  let res: Response
  try {
    const body = [...history, { role: "user" as const, content: query }]
    res = await demoFetch("/api/demo/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "data", messages: body }),
      signal: controller.signal,
    })
  } catch (err) {
    window.clearInterval(cancelTimer)
    throw err
  }
  if (!res.ok || !res.body) {
    window.clearInterval(cancelTimer)
    throw new Error(`Mode B start failed: ${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (cancelRef.current) {
        controller.abort()
        break
      }
      buf += decoder.decode(value, { stream: true })
      const frames = buf.split("\n\n")
      buf = frames.pop() ?? ""
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6)
          let event: StreamedToolEvent
          try {
            event = JSON.parse(payload) as StreamedToolEvent
          } catch {
            continue
          }
          if (event.type === "text-delta") {
            smoother.textBuf += event.text
            startDrainer()
          } else if (event.type === "thinking-delta") {
            smoother.thinkingBuf += event.text
            startDrainer()
          } else {
            // Flush any pending text first so the UI ordering is correct.
            flushBuffers()
            dispatch(event, pendingInputs, callbacks)
          }
        }
      }
    }
  } finally {
    window.clearInterval(cancelTimer)
    flushBuffers()
    if (smoother.timer) window.clearInterval(smoother.timer)
    callbacks.onStreamEnd()
  }
}

function dispatch(
  event: StreamedToolEvent,
  pendingInputs: Map<string, string>,
  callbacks: ModeBCallbacks,
): void {
  switch (event.type) {
    case "thinking-start":
    case "text-start":
    case "thinking-stop":
    case "text-stop":
      // Block lifecycle markers — useful for animation later.
      break

    case "tool-use-start": {
      pendingInputs.set(event.toolUseId, "")
      callbacks.onToolUseStart(event.toolUseId, event.toolName)
      break
    }

    case "tool-use-input-delta": {
      const prev = pendingInputs.get(event.toolUseId) ?? ""
      pendingInputs.set(event.toolUseId, prev + event.partialJson)
      break
    }

    case "tool-use-stop": {
      const inputStr = pendingInputs.get(event.toolUseId) ?? ""
      pendingInputs.delete(event.toolUseId)
      if (!inputStr) break
      let parsedInput: Record<string, unknown> | null = null
      try {
        parsedInput = JSON.parse(inputStr) as Record<string, unknown>
      } catch {
        // Leave args null rather than ship malformed JSON to the UI.
      }
      callbacks.onToolUseInputResolved(event.toolUseId, parsedInput)
      break
    }

    case "tool-result": {
      callbacks.onToolResult(event.toolUseId, event.content, event.isError)
      break
    }

    case "continuation":
      // The client-side tool loop just looped another turn. No UI marker —
      // the visual order of appended blocks already makes the loop obvious.
      break

    case "message-stop": {
      if (event.usage) {
        callbacks.onUsage({
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
        })
      }
      break
    }

    case "error": {
      callbacks.onError(event.message)
      break
    }

    default:
      break
  }
}
