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
  toolName: string
  args: Record<string, unknown> | null
  /** "dataset" when the call hit a cluster tool, "api" for an external proxy. */
  kind: "dataset" | "api"
  /** Numeric dataset IDs touched by this call (zero or more). */
  datasetIds: number[]
  /** When `kind === "api"`, the platform connector id; null otherwise. */
  connectorId: number | null
  /** Stable attribution key — `dataset:<id>` or `connector:<id>` or a label. */
  attributionKey: string
  /** Display label for the source (cluster name, connector name, …). */
  attributionLabel: string
  /** € paid for THIS single call, summed across all datasets touched. */
  royaltyEur: number
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

export type ConfigSavedEvent = { type: "config-saved" }
export type ResetChatEvent = { type: "reset-chat" }

export type DemoEvent = ToolCallEvent | UsageEvent | ConfigSavedEvent | ResetChatEvent

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
