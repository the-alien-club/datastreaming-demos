"use client"

/**
 * Demo-wide orchestrator state — POST `@alien/chat-sdk` migration.
 *
 * The hook used to own the entire chat machinery (streaming runners,
 * per-call dispatch + settle, message tree, tool cards, royalty cascade,
 * cost-breakdown replay — ~1.6k lines). After the v0.3 SDK extraction it
 * owns ONLY the things that live outside the SDK's scope:
 *
 *   - Config catalog + dirtiness + save (`useConfig`)
 *   - Pricing map (`usePricing`)
 *   - Suggestions (`useDynamicSuggestions`) and chip press state
 *   - Mode selector + the "switch?" modal pending state
 *   - Observability state machinery (counters, tape feed, attribution,
 *     pulses) — driven by the `DemoEvent` bus, same as before
 *   - Reset / config-saved emission and the cfgPulse counter
 *
 * Chat itself runs through `useChat` from the SDK; tool-call attribution
 * and royalty computation is in `lib/publisher-bridge.ts`, wired in via the
 * SDK's `onEvent` hook. The bridge is the ONLY new code that knows about
 * both the SDK and the demo's enriched DemoEvent shape — every other panel
 * keeps consuming DemoEvents unchanged.
 *
 * `messages` and `timeline` are derived from `chat.turns` via the adapter
 * below so the existing `<Agent>` panel sees the same shape it always has.
 */
import type { ChatTurn as SdkChatTurn } from "@alien/chat-sdk"
import type { ChatEvent } from "@alien/chat-sdk/events"
import {
  type ChatMode,
  useChat,
  useChatTimeline,
} from "@alien/chat-sdk/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Timeline } from "@/components/panels/agent"
import type {
  AttributionRow,
  Counters,
  ObservabilityPulse,
  TapeRow,
} from "@/lib/observability-types"
import type {
  AgentPart,
  AgentTurn,
  ChatMessage,
  ToolEntry,
  UserTurn,
  ScopeNotice,
} from "@/lib/chat-messages"
import { getStoredConfigSlug } from "@/lib/client/local-config"
import { createPublisherBridge, type PublisherBridge } from "@/lib/publisher-bridge"
import { type UseConfigResult, useConfig } from "./use-config"
import { useDemoEventListener, useDemoEvents } from "./use-demo-events"
import { type SuggestionsStatus, useDynamicSuggestions } from "./use-dynamic-suggestions"
import { type Mode, useMode } from "./use-mode"
import { usePricing } from "./use-pricing"

const ROY_HIST_LEN = 32
const MAX_TAPE_BUFFER = 12

const PENDING3: Timeline = {
  planner: { status: "pending", count: 0 },
  specialist: { status: "pending", count: 0 },
  critic: { status: "pending", count: 0 },
}

const pad = (n: number) => String(n).padStart(2, "0")
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

function formatTapeTool(toolName: string, args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return `${toolName}()`
  const entries = Object.entries(args).slice(0, 2)
  const summary = entries
    .map(([k, v]) => {
      if (typeof v === "string") {
        const clipped = v.length > 28 ? `${v.slice(0, 25)}…` : v
        return `${k}=${JSON.stringify(clipped)}`
      }
      return `${k}=${JSON.stringify(v)}`
    })
    .join(", ")
  return `${toolName}(${summary})`
}

function formatTapeMeta(tokens: number, royaltyEur: number, label: string): string {
  const tokenLabel = tokens > 0 ? `${tokens.toLocaleString()} tok` : "—"
  const eurLabel = royaltyEur > 0 ? `€${royaltyEur.toFixed(4)}` : "no price"
  return `${tokenLabel} · ${eurLabel} · ${label}`
}

function upsertAttribution(
  rows: AttributionRow[],
  event: { attributionKey: string; attributionLabel: string; royaltyEur: number },
): AttributionRow[] {
  const idx = rows.findIndex((r) => r.key === event.attributionKey)
  if (idx === -1) {
    return [
      ...rows,
      {
        key: event.attributionKey,
        label: event.attributionLabel,
        eur: round4(event.royaltyEur),
        calls: 1,
      },
    ]
  }
  const next = [...rows]
  const existing = next[idx]!
  next[idx] = {
    ...existing,
    eur: round4(existing.eur + event.royaltyEur),
    calls: existing.calls + 1,
  }
  return next
}

// Stable string-id → numeric uid for the chat panel. The panel uses `uid` as
// a React key and equality token; only stability matters, not the value.
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) || 1
}

const MEMO_AGENT_EXCERPT_CAP = 1200

/** Flatten an SDK assistant turn's parts down to plain text. */
function joinAssistantText(parts: SdkChatTurn extends infer T
  ? T extends { role: "assistant"; parts: infer P }
    ? P
    : never
  : never): string {
  const out: string[] = []
  const walk = (ps: unknown): void => {
    if (!Array.isArray(ps)) return
    for (const p of ps as Array<Record<string, unknown>>) {
      if (p.kind === "text" && typeof p.text === "string") out.push(p.text)
      else if (p.kind === "instance" && Array.isArray(p.children)) {
        walk(p.children)
      }
    }
  }
  walk(parts)
  return out.join("").trim()
}

/**
 * Build the compact conversation memo (last user message + truncated last
 * agent reply) the suggestions hook consumes as its regeneration trigger.
 */
function buildConversationMemo(turns: SdkChatTurn[]): string | null {
  let lastUser: string | null = null
  let lastAgent: string | null = null
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (!turn) continue
    if (turn.role === "user" && lastUser === null) lastUser = turn.text
    if (turn.role === "assistant" && lastAgent === null) {
      const text = joinAssistantText(turn.parts)
      if (text) lastAgent = text
    }
    if (lastUser !== null && lastAgent !== null) break
  }
  if (lastUser === null && lastAgent === null) return null
  const agentExcerpt =
    lastAgent && lastAgent.length > MEMO_AGENT_EXCERPT_CAP
      ? `${lastAgent.slice(0, MEMO_AGENT_EXCERPT_CAP - 1)}…`
      : lastAgent
  return [
    lastUser ? `User: ${lastUser}` : null,
    agentExcerpt ? `Assistant: ${agentExcerpt}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

// ── Adapter: SDK chat turns → demo's ChatMessage[] ─────────────────────────

function adaptChatTurns(
  turns: SdkChatTurn[],
  bridge: PublisherBridge | null,
  mode: Mode,
): ChatMessage[] {
  const senderLabel = mode === "agentic" ? "Agentic flow" : "Data flow"
  // The last assistant turn gets `fresh: true` so the panel can play its
  // entrance animation. Older turns settle into the static state.
  let lastAssistantIdx = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === "assistant") {
      lastAssistantIdx = i
      break
    }
  }
  return turns.map((turn, idx): ChatMessage => {
    if (turn.role === "user") {
      const t: UserTurn = { uid: hashId(turn.id), role: "user", text: turn.text }
      return t
    }
    if (turn.role === "notice") {
      const n: ScopeNotice = { uid: hashId(turn.id), role: "scope", text: turn.text }
      return n
    }
    const a: AgentTurn = {
      uid: hashId(turn.id),
      role: "agent",
      sender: senderLabel,
      parts: adaptParts(turn.parts, bridge),
      streaming: turn.streaming,
      fresh: idx === lastAssistantIdx,
    }
    return a
  })
}

function adaptParts(
  parts: ReadonlyArray<unknown>,
  bridge: PublisherBridge | null,
  /** Author for text parts inside an instance block — drives the panel's
   *  per-subagent styling (planner-cards rendering, specialist colour, etc.). */
  author: "main" | "planner" | "specialist" | "critic" | "other" = "main",
): AgentPart[] {
  return parts.map((raw) => {
    const p = raw as Record<string, unknown>
    if (p.kind === "text") {
      return { kind: "text", text: String(p.text ?? ""), author }
    }
    if (p.kind === "thinking") {
      return { kind: "thinking", text: String(p.text ?? "") }
    }
    if (p.kind === "tool") {
      const sdkTool = p.tool as {
        toolUseId: string
        toolName: string
        inputText: string
        input: Record<string, unknown> | null
        result: string
        running: boolean
        isError: boolean
        startedAt: number
        endedAt: number | null
      }
      const attribution = bridge?.getAttribution(sdkTool.toolUseId) ?? null
      const summary = sdkTool.running
        ? "…"
        : sdkTool.isError
          ? "error"
          : (attribution?.attributionLabel ?? "✓")
      const icon = attribution?.kind === "api" ? "plug" : "search"
      const argsJson = sdkTool.input
        ? JSON.stringify(sdkTool.input, null, 2)
        : sdkTool.inputText || "{}"
      const tool: ToolEntry = {
        toolUseId: sdkTool.toolUseId,
        icon,
        name: sdkTool.toolName,
        summary,
        args: argsJson,
        result: sdkTool.result,
        running: sdkTool.running,
        startedAt: sdkTool.startedAt,
      }
      return { kind: "tool", tool }
    }
    // instance
    const inst = p as {
      instanceKey: string
      canonicalType: "main" | "planner" | "specialist" | "critic" | "other"
      displayName: string
      ordinal: number
      status: "running" | "done"
      children: unknown[]
    }
    return {
      kind: "instance",
      instanceKey: inst.instanceKey,
      // Demo distinguishes raw `agentType` (registry id) from canonicalType
      // (renderer style). The SDK only carries the canonical — fine for
      // rendering, only used as a fallback label in the panel.
      agentType: inst.canonicalType,
      canonicalType: inst.canonicalType,
      displayName: inst.displayName,
      ordinal: inst.ordinal,
      status: inst.status,
      // Propagate the instance's canonical type as author on its child text
      // parts so the panel's `author === "planner"` path renders the planner
      // task list as cards instead of raw JSON.
      children: adaptParts(inst.children, bridge, inst.canonicalType),
    }
  })
}

// ── Public interface — unchanged from pre-migration ────────────────────────

export interface OrchestratorState {
  config: UseConfigResult
  mode: Mode
  pendingMode: Mode | null
  setPendingMode: (m: Mode | null) => void
  onRequestSwitch: (target: Mode) => void
  confirmSwitch: () => void
  messages: ChatMessage[]
  timeline: Timeline
  railActive: boolean
  input: string
  setInput: (s: string) => void
  pressed: number | null
  onChip: (text: string, idx: number) => void
  runAgent: (query: string) => Promise<void>
  counters: Counters
  royHist: number[]
  feed: TapeRow[]
  attribution: AttributionRow[]
  pulse: ObservabilityPulse
  feedFlash: number
  cfgPulse: number
  sessionRoyalty: number
  onToggleDataset: (clusterId: number, datasetId: number) => void
  onToggleCluster: (clusterId: number) => void
  onToggleConnector: (connectorId: number) => void
  onSaveConfig: () => Promise<void>
  dsClusterCount: number
  apiSelectedCount: number
  reset: () => void
  suggestions: string[]
  suggestionsStatus: SuggestionsStatus
}

export interface UseOrchestratorStateOptions {
  /** Per-suggestion character cap. Mobile passes a tighter value (≤ ~55). */
  suggestionsLengthHint?: number
}

export function useOrchestratorState(
  options: UseOrchestratorStateOptions = {},
): OrchestratorState {
  const { suggestionsLengthHint } = options
  const config = useConfig()
  const pricing = usePricing()
  const events = useDemoEvents()
  const { mode, setMode: persistMode } = useMode()

  // ── Bridge (stable across renders; deps refreshed on change) ─────────────
  const bridgeRef = useRef<PublisherBridge | null>(null)
  if (bridgeRef.current === null) {
    bridgeRef.current = createPublisherBridge({
      emit: events.emit,
      sources: config.sources,
      computeRoyalty: pricing.computeRoyalty,
    })
  }
  useEffect(() => {
    bridgeRef.current?.refresh({
      sources: config.sources,
      computeRoyalty: pricing.computeRoyalty,
    })
  }, [config.sources, pricing.computeRoyalty])

  // Stable feed handler so useChat doesn't restart streams when bridgeRef.current
  // identity changes (it doesn't, but defensive).
  const feedEvent = useCallback((event: ChatEvent) => {
    bridgeRef.current?.feed(event)
  }, [])

  // ── Mode mapping ─────────────────────────────────────────────────────────
  // The demo persists "dataflow" | "agentic" in localStorage (via useMode);
  // the SDK speaks "claude" | "alien". Bridge them at the boundary so neither
  // side leaks into the other.
  const toSdkMode = (m: Mode): ChatMode => (m === "agentic" ? "alien" : "claude")
  const fromSdkMode = (m: ChatMode): Mode => (m === "alien" ? "agentic" : "dataflow")

  // ── SDK chat hook owns turns, input, streaming, mode at the SDK level ────
  const buildHeaders = useCallback((): Record<string, string> => {
    const slug = getStoredConfigSlug()
    return slug ? { "x-demo-config-slug": slug } : {}
  }, [])
  const chat = useChat({
    endpoint: "/api/demo/chat",
    mode: toSdkMode(mode),
    headers: buildHeaders,
    onEvent: feedEvent,
    // smoothing defaults to on (25ms/word) — matches the prior mode-b behaviour
  })

  // ── Adapter: SDK turns → demo's ChatMessage shape the panel expects ──────
  const messages = useMemo(
    () => adaptChatTurns(chat.turns, bridgeRef.current, mode),
    [chat.turns, mode],
  )

  // ── Timeline derived from chat.turns ─────────────────────────────────────
  const sdkTimeline = useChatTimeline(chat.turns)
  const timeline = useMemo<Timeline>(() => {
    if (mode !== "agentic") return PENDING3
    const map = (s: "idle" | "running" | "done"): "pending" | "exec" | "done" =>
      s === "idle" ? "pending" : s === "running" ? "exec" : "done"
    return {
      planner: { status: map(sdkTimeline.planner.status), count: sdkTimeline.planner.count },
      specialist: {
        status: map(sdkTimeline.specialist.status),
        count: sdkTimeline.specialist.count,
      },
      critic: { status: map(sdkTimeline.critic.status), count: sdkTimeline.critic.count },
    }
  }, [sdkTimeline, mode])
  const railActive = mode === "agentic" && chat.isStreaming

  // ── Observability state machinery (unchanged from pre-migration) ─────────
  const [counters, setCounters] = useState<Counters>({
    apiCalls: 0,
    dataPoints: 0,
    royalties: 0,
  })
  const [royHist, setRoyHist] = useState<number[]>([])
  const [feed, setFeed] = useState<TapeRow[]>([])
  const [attribution, setAttribution] = useState<AttributionRow[]>([])
  const [pulse, setPulse] = useState<ObservabilityPulse>({ ds: null, api: null, attr: null })
  const [feedFlash, setFeedFlash] = useState(0)
  const [cfgPulse, setCfgPulse] = useState(0)

  useEffect(() => {
    setRoyHist((h) => [...h.slice(-(ROY_HIST_LEN - 1)), counters.royalties])
  }, [counters.royalties])
  const sessionRoyalty = counters.royalties

  // `tool-call` → live tape ping + counter bump.
  useDemoEventListener("tool-call", (event) => {
    const ts = new Date(event.timestamp)
    const rowUid = event.toolUseId ?? String(event.timestamp)
    const row: TapeRow = {
      uid: rowUid,
      t: `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`,
      tool: formatTapeTool(event.toolName, event.args),
      meta: formatTapeMeta(event.tokensEstimate, 0, event.attributionLabel),
      fresh: true,
      attributionKey: event.attributionKey,
    }
    window.setTimeout(() => {
      setFeed((prev) =>
        [row, ...prev.map((r) => ({ ...r, fresh: false }))].slice(0, MAX_TAPE_BUFFER),
      )
    }, 100)
    window.setTimeout(() => {
      setCounters((c) => ({ ...c, apiCalls: c.apiCalls + 1 }))
    }, 200)
    // datasources / connectors panels pick up the pulse from their own
    // listeners that match attributionKey; we just stash the "fresh" hint
    // here for the observability tape.
    if (event.kind === "dataset") {
      setPulse((p) => ({ ...p, ds: { id: event.attributionKey, n: (p.ds?.n ?? 0) + 1 } }))
    } else {
      setPulse((p) => ({ ...p, api: { id: event.attributionKey, n: (p.api?.n ?? 0) + 1 } }))
    }
  })

  // `tool-result` → patch tape, settle counters + per-source attribution.
  useDemoEventListener("tool-result", (event) => {
    setFeed((prev) => {
      if (event.toolUseId?.startsWith("brick:")) {
        const key = event.attributionRows[0]?.attributionKey
        if (!key || event.hits <= 0) return prev
        const perCall = event.royaltyEur / event.hits
        const perCallLabel = perCall > 0 ? `€${perCall.toFixed(4)}` : "no price"
        return prev.map((r) =>
          r.attributionKey === key
            ? { ...r, meta: r.meta.replace(/€\d+\.\d+|no price/, perCallLabel) }
            : r,
        )
      }
      const meta = event.isError
        ? formatTapeMeta(0, 0, `${event.toolName} · error`)
        : (() => {
            const label = event.attributionRows[0]?.attributionLabel ?? event.toolName
            return formatTapeMeta(0, event.royaltyEur, `${label} · ${event.hits} hits`)
          })()
      return prev.map((r) => (r.uid === event.toolUseId ? { ...r, meta, fresh: true } : r))
    })
    if (event.isError) return
    setCounters((c) => ({
      apiCalls: c.apiCalls,
      dataPoints: c.dataPoints + event.hits,
      royalties: round4(c.royalties + event.royaltyEur),
    }))
    setAttribution((rows) => {
      let next = rows
      for (const row of event.attributionRows) {
        next = upsertAttribution(next, row)
      }
      return next
    })
    if (event.attributionRows.length > 0) {
      const last = event.attributionRows[event.attributionRows.length - 1]!
      setPulse((p) => ({
        ...p,
        attr: {
          key: last.attributionKey,
          n: p.attr ? p.attr.n + 1 : 1,
          amount: event.royaltyEur,
        },
      }))
    }
  })

  useDemoEventListener("reset-chat", () => {
    setCounters({ apiCalls: 0, dataPoints: 0, royalties: 0 })
    setFeed([])
    setAttribution([])
    setRoyHist([])
    setPulse({ ds: null, api: null, attr: null })
  })

  // ── Suggestions ──────────────────────────────────────────────────────────
  const [conversationMemo, setConversationMemo] = useState<string | null>(null)
  const [turnCounter, setTurnCounter] = useState(0)
  const isStreaming = chat.isStreaming
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setConversationMemo(buildConversationMemo(chat.turns))
      setTurnCounter((n) => n + 1)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, chat.turns])

  const { suggestions, status: suggestionsStatus } = useDynamicSuggestions({
    mode,
    view: config.view,
    memo: conversationMemo,
    turnCounter,
    isStreaming,
    lengthHint: suggestionsLengthHint,
  })

  // ── Chip press + send ────────────────────────────────────────────────────
  const [pressed, setPressed] = useState<number | null>(null)
  const onChip = useCallback(
    (text: string, idx: number) => {
      setPressed(idx)
      window.setTimeout(() => setPressed(null), 240)
      void chat.sendMessage(text)
    },
    [chat],
  )

  const runAgent = useCallback(
    async (query: string) => {
      await chat.sendMessage(query)
    },
    [chat],
  )

  // ── Mode switch + reset ──────────────────────────────────────────────────
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)

  const onRequestSwitch = useCallback(
    (target: Mode) => {
      if (target === mode) return
      if (chat.turns.length === 0 && !chat.isStreaming) {
        chat.setMode(toSdkMode(target))
        persistMode(target)
        events.emit({ type: "reset-chat" })
      } else {
        setPendingMode(target)
      }
    },
    [chat, events, mode, persistMode],
  )

  const confirmSwitch = useCallback(() => {
    if (!pendingMode) return
    chat.setMode(toSdkMode(pendingMode))
    persistMode(pendingMode)
    setPendingMode(null)
    bridgeRef.current?.reset()
    events.emit({ type: "reset-chat" })
  }, [chat, events, pendingMode, persistMode])

  const reset = useCallback(() => {
    if (chat.mode !== "claude") {
      chat.setMode("claude")
      persistMode("dataflow")
    } else {
      chat.reset()
    }
    setPendingMode(null)
    setPressed(null)
    setConversationMemo(null)
    setTurnCounter((n) => n + 1)
    bridgeRef.current?.reset()
    config.reset()
    events.emit({ type: "reset-chat" })
  }, [chat, config, events, persistMode])

  // Keep the persistence in sync if SDK mode changes externally (defensive —
  // every set goes through us today). Translates back to the demo's vocab.
  useEffect(() => {
    const demoMode = fromSdkMode(chat.mode)
    if (demoMode !== mode) persistMode(demoMode)
  }, [chat.mode, mode, persistMode])

  // ── Config toggle + save ─────────────────────────────────────────────────
  const onToggleDataset = useCallback(
    (clusterId: number, datasetId: number) =>
      config.toggle({ kind: "dataset", clusterId, datasetId }),
    [config],
  )
  const onToggleCluster = useCallback(
    (clusterId: number) => config.toggle({ kind: "cluster-all", clusterId }),
    [config],
  )
  const onToggleConnector = useCallback(
    (connectorId: number) => config.toggle({ kind: "connector", connectorId }),
    [config],
  )

  const onSaveConfig = useCallback(async () => {
    try {
      await config.save()
      setCfgPulse((n) => n + 1)
      setFeedFlash((n) => n + 1)
      events.emit({ type: "config-saved" })
      chat.notice("Configuration updated · applying…", { level: "info", ttlMs: 3400 })
    } catch (err) {
      console.error("[demo] save failed:", err)
      chat.notice(`Save failed: ${err instanceof Error ? err.message : String(err)}`, {
        level: "error",
        ttlMs: 5000,
      })
    }
  }, [chat, config, events])

  const dsClusterCount =
    config.view?.clusters.filter((c) => c.datasets.some((d) => d.checked)).length ?? 0
  const apiSelectedCount = config.view?.externalApis.filter((a) => a.checked).length ?? 0

  return {
    config,
    mode,
    pendingMode,
    setPendingMode,
    onRequestSwitch,
    confirmSwitch,
    messages,
    timeline,
    railActive,
    input: chat.input,
    setInput: chat.setInput,
    pressed,
    onChip,
    runAgent,
    counters,
    royHist,
    feed,
    attribution,
    pulse,
    feedFlash,
    cfgPulse,
    sessionRoyalty,
    onToggleDataset,
    onToggleCluster,
    onToggleConnector,
    onSaveConfig,
    dsClusterCount,
    apiSelectedCount,
    reset,
    suggestions,
    suggestionsStatus,
  }
}

export const MODEL = "Claude Sonnet 4.6"

export const EMPTY_STATE: Record<Mode, string> = {
  dataflow: "Live chat on the active MCP Configuration. Every read is metered and attributed.",
  agentic: "Live workflow on the active MCP Configuration. Give the planner a multi-step task.",
}
