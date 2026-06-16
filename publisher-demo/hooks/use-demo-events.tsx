"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"

/**
 * The typed event union dispatched across panels.
 *
 *   tool-call    — server-resolved per-call event carrying everything the
 *                  observability + ripple panels need: the resolved cluster
 *                  / dataset / connector handles, the € royalty for this
 *                  single call, the dataset & API attribution keys.
 *   usage        — rolled up token usage emitted once at turn end.
 *   config-saved — fires after a successful PUT /api/demo/config so the
 *                  config chip can pulse and the agent panel can show its
 *                  "Configuration updated · applying…" notice.
 *   reset-chat   — fires on mode switch or full reset.
 */
export type ToolCallEvent = {
  type: "tool-call"
  /** SDK tool_use_id when available; lets `tool-result` events correlate back. */
  toolUseId: string | null
  toolName: string
  args: Record<string, unknown> | null
  /** "dataset" when the call hit a cluster tool, "api" for an external proxy. */
  kind: "dataset" | "api"
  /** When `kind === "api"`, the platform connector id; null otherwise. */
  connectorId: number | null
  /** Stable attribution key — `dataset:<id>` or `connector:<id>` or a label. */
  attributionKey: string
  /** Display label for the source (cluster name, connector name, …). */
  attributionLabel: string
  /** Estimated tokens for the live tape row when no usage is provided. */
  tokensEstimate: number
  /** ISO clock time the call landed (server time). */
  timestamp: number
}

export type UsageEvent = {
  type: "usage"
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number
}

/**
 * Fires when a tool result lands. Carries the *actual* attribution extracted
 * from the result payload (cluster_ids/dataset_ids/hits). Unlike `tool-call`
 * which fires on dispatch (when we can only guess attribution from args),
 * `tool-result` is the source of truth for royalties + data points.
 */
export type ToolResultEvent = {
  type: "tool-result"
  toolUseId: string
  toolName: string
  /** Stable per-call id used by `tool-call` for de-duping/ordering. */
  callTimestamp: number
  /** Per-cluster attribution rows. Display label resolved from catalog. */
  attributionRows: Array<{
    attributionKey: string
    attributionLabel: string
    clusterId: number | null
    royaltyEur: number
    datasetIds: number[]
  }>
  /** Total € across all clusters touched by this call. */
  royaltyEur: number
  /** Number of dataset hits the tool returned (drives "data points"). */
  hits: number
  /** Truncated text of the result (max 280 chars) for the chat message. */
  resultSnippet: string
  /**
   * True when the underlying MCP tool returned `isError`. The result is still
   * emitted so the placeholder tape row gets patched (instead of staying at
   * its initial "no price · 0 hits" string forever), but listeners must NOT
   * credit hits or royalties for an errored call — `attributionRows` and
   * `royaltyEur` are zero, `hits` is zero, and the tape label should read
   * "error" rather than "0 hits".
   */
  isError: boolean
}

export type ConfigSavedEvent = { type: "config-saved" }
export type ResetChatEvent = { type: "reset-chat" }

export type DemoEvent =
  | ToolCallEvent
  | ToolResultEvent
  | UsageEvent
  | ConfigSavedEvent
  | ResetChatEvent

type Listener = (e: DemoEvent) => void

interface DemoEventsApi {
  emit: (e: DemoEvent) => void
  subscribe: (l: Listener) => () => void
}

const Ctx = createContext<DemoEventsApi | null>(null)

/**
 * Provider with a ref-based listener registry. Emitting an event does NOT
 * re-render the provider — listeners receive the event synchronously and
 * choose how to react (setState, mutate a ref, etc.). This keeps the
 * high-frequency tool-call path from forcing a re-render of every panel.
 */
export function DemoEventsProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set())

  const subscribe = useCallback((l: Listener) => {
    listenersRef.current.add(l)
    return () => {
      listenersRef.current.delete(l)
    }
  }, [])

  const emit = useCallback((e: DemoEvent) => {
    for (const listener of listenersRef.current) {
      try {
        listener(e)
      } catch (err) {
        console.error("[demo-events] listener threw:", err)
      }
    }
  }, [])

  const value = useMemo<DemoEventsApi>(() => ({ emit, subscribe }), [emit, subscribe])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDemoEvents(): DemoEventsApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useDemoEvents must be used inside <DemoEventsProvider>")
  return ctx
}

/**
 * Convenience: subscribe to one event type for the lifetime of the component.
 * Pass a stable handler (e.g. `useCallback` or a ref-backed dispatcher) to
 * avoid re-subscribing on every render.
 */
export function useDemoEventListener<T extends DemoEvent["type"]>(
  type: T,
  handler: (event: Extract<DemoEvent, { type: T }>) => void,
) {
  const { subscribe } = useDemoEvents()
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    return subscribe((e) => {
      if (e.type === type) handlerRef.current(e as Extract<DemoEvent, { type: T }>)
    })
  }, [type, subscribe])
}
