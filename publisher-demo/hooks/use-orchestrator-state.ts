"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Timeline } from "@/components/panels/agent"
import type { CostBreakdownPayload } from "@/lib/mode-a/run"
import { runModeA } from "@/lib/mode-a/run"
import { runModeB } from "@/lib/mode-b/run"
import type {
  AttributionRow,
  Counters,
  ObservabilityPulse,
  TapeRow,
} from "@/lib/observability-types"
import { extractResultMeta, snippetForDisplay } from "@/lib/result-meta"
import { resolveToolSource, type UseConfigResult, useConfig } from "./use-config"
import { useDemoEventListener, useDemoEvents } from "./use-demo-events"
import { type SuggestionsStatus, useDynamicSuggestions } from "./use-dynamic-suggestions"
import { type Mode, useMode } from "./use-mode"
import { usePricing } from "./use-pricing"

const ROY_HIST_LEN = 32
const MAX_TAPE_BUFFER = 12
const DONE3 = { planner: "done", specialist: "done", critic: "done" } as const

export interface AgentTool {
  /** SDK tool_use_id; lets us find this entry when the tool result lands. */
  toolUseId: string | null
  icon: string
  name: string
  summary: string
  args: string
  result: string
  /** True from tool-use-start until tool-result lands. */
  running: boolean
  /** Date.now() when the call dispatched. Drives the elapsed-time chip. */
  startedAt: number
}

/**
 * Sub-roles emitted by the platform inside one Mode A turn. The orchestrator
 * (MAIN) dispatches three named subagents in sequence. Mode B has no
 * subagents — its text is always authored by "main".
 */
export type AgentAuthor = "main" | "planner" | "specialist" | "critic"

/**
 * Ordered slices of an agent's turn. Rendered in the order they were
 * appended so tool calls and prose interleave faithfully (text, tool, text,
 * tool, tool, text, …) rather than being grouped by kind.
 */
export type AgentPart =
  | { kind: "text"; text: string; author?: AgentAuthor }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; tool: AgentTool }
  | {
      kind: "subagent"
      name: AgentAuthor
      status: "running" | "done"
      children: AgentPart[]
    }

export type ChatMessage =
  | { uid: number; role: "user"; text: string }
  | {
      uid: number
      role: "agent"
      sender: string
      /** Chronologically-ordered parts (text / thinking / tool, interleaved). */
      parts: AgentPart[]
      streaming: boolean
      faded?: boolean
      fresh: boolean
      chain?: { who: string; text: string }[]
    }
  | { uid: number; role: "scope"; text: string }

const pad = (n: number) => String(n).padStart(2, "0")
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Sum the entries-per-dataset map into a single hit count. Used as the
 * `data points` figure for a tool result — only counts entries the walker
 * actually saw (i.e. paid entries with a real dataset_id), so listing tools
 * like `list_datasets` that return zero entries score 0 hits. */
function sumEntries(entriesPerDataset: Record<number, number>): number {
  let total = 0
  for (const n of Object.values(entriesPerDataset)) total += n
  return total
}

/** Pull a numeric `entry_id` (or `entryId`) out of a tool's dispatched args.
 * Returns `null` when missing or non-numeric — callers fall back to whatever
 * the result body itself reveals. */
function extractEntryIdArg(args: Record<string, unknown> | null): number | null {
  if (!args) return null
  const raw = args.entry_id ?? args.entryId
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Parse a platform composite entry-id argument of the form
 * `"clusterId:datasetId:entryId"` (see `lib/cluster_composite_id.ts` on the
 * backend). The `datacluster_get_entry_*` MCP tools take a single
 * `composite_id` string instead of three numeric fields, and their response
 * payloads no longer echo the raw IDs back. Without this parse the result
 * walker has nothing to attribute, the args lookup finds no `entry_id`, and
 * the call settles as `0 hits / no price`.
 *
 * Returns `null` when the field is missing or doesn't parse as three
 * positive integers separated by `:` — callers fall through to the prior
 * recovery paths (entry→dataset cache, €0.01 fallback) in that case.
 */
function parseCompositeEntryArg(
  args: Record<string, unknown> | null,
): { clusterId: number; datasetId: number; entryId: number } | null {
  if (!args) return null
  const raw = args.composite_id ?? args.compositeId ?? args.composite_entry_id
  if (typeof raw !== "string") return null
  const parts = raw.split(":")
  if (parts.length !== 3) return null
  const [c, d, e] = parts.map((p) => Number(p))
  if (
    !Number.isInteger(c) ||
    !Number.isInteger(d) ||
    !Number.isInteger(e) ||
    c <= 0 ||
    d <= 0 ||
    e <= 0
  ) {
    return null
  }
  return { clusterId: c, datasetId: d, entryId: e }
}

function formatTapeTool(toolName: string, args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return `${toolName}()`
  const entries = Object.entries(args).slice(0, 2)
  const summary = entries
    .map(([k, v]) => {
      if (typeof v === "string") {
        const clipped = v.length > 28 ? `${v.slice(0, 25)}…` : v
        return `${k}=${JSON.stringify(clipped)}`
      }
      if (Array.isArray(v)) return `${k}=[${v.length}]`
      if (v && typeof v === "object") return `${k}={…}`
      return `${k}=${String(v)}`
    })
    .join(", ")
  const more = Object.keys(args).length > entries.length ? ", …" : ""
  return `${toolName}(${summary}${more})`
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
  next[idx] = {
    ...next[idx],
    eur: round4(next[idx].eur + event.royaltyEur),
    calls: next[idx].calls + 1,
  }
  return next
}

/**
 * Append a delta to the current open part of `kind`, or open a new one if
 * the last part is something else. Used by the streaming dispatch so
 * consecutive deltas accumulate inside one part, but a different content
 * block in between forces a fresh part.
 */
function appendDelta(parts: AgentPart[], kind: "text" | "thinking", delta: string): AgentPart[] {
  const last = parts[parts.length - 1]
  if (last && last.kind === kind) {
    return [...parts.slice(0, -1), { kind, text: last.text + delta }]
  }
  return [...parts, { kind, text: delta }]
}

/** Back-compat alias — callers that only deal with text deltas. */
const appendTextDelta = (parts: AgentPart[], delta: string): AgentPart[] =>
  appendDelta(parts, "text", delta)

/**
 * Append-or-coalesce a text delta inside a `parts` array (without descending
 * into nested subagent blocks). If the last sibling is a text part by the
 * same author, append to it; otherwise open a fresh author-labeled text part.
 */
function appendTextDeltaSiblings(
  parts: AgentPart[],
  author: AgentAuthor,
  delta: string,
): AgentPart[] {
  const last = parts[parts.length - 1]
  if (last && last.kind === "text" && (last.author ?? "main") === author) {
    return [...parts.slice(0, -1), { kind: "text", text: last.text + delta, author }]
  }
  return [...parts, { kind: "text", text: delta, author }]
}

/**
 * Find the existing block for `role` and apply `mutator` to its children;
 * if no block exists, create one at the end of `parts` with the mutator's
 * output as its only contents. Used to enforce "one block per role" —
 * Mode A's orchestrator activates the same subagent many times per turn,
 * but visually we collapse them into a single Planner / Specialist / Critic
 * container that accumulates everything that role produces.
 */
function routeIntoRoleBlock(
  parts: AgentPart[],
  role: AgentAuthor,
  mutator: (siblings: AgentPart[]) => AgentPart[],
): AgentPart[] {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind === "subagent" && p.name === role) {
      const next = parts.slice()
      next[i] = { ...p, children: mutator(p.children) }
      return next
    }
  }
  return [...parts, { kind: "subagent", name: role, status: "running", children: mutator([]) }]
}

/**
 * Append a text delta authored by `author`.
 *
 * - `main` text is the orchestrator's prose (inter-subagent commentary, final
 *   synthesis). Lands at the root.
 * - Any other author routes to that role's block (find-or-create).
 *
 * Same-author consecutive text-deltas coalesce into one text part inside the
 * target container — the platform streams text one word at a time and a
 * naïve append would produce hundreds of single-word `<div>`s.
 */
function appendAuthorTextDelta(
  parts: AgentPart[],
  author: AgentAuthor,
  delta: string,
): AgentPart[] {
  if (author === "main") {
    // MAIN speaking implies all subagents are done (the orchestrator only
    // narrates between or after subagent runs).
    const settled = closeAllOpenSubagentBanners(parts)
    return appendTextDeltaSiblings(settled, author, delta)
  }
  // Route into the role's block. Also flip status so THIS role is "running"
  // and the others are "done" — text-deltas are the most reliable signal of
  // who's currently speaking, since the platform's data-subagent events are
  // noisy and sometimes arrive out of order relative to text-start.
  const routed = routeIntoRoleBlock(parts, author, (siblings) =>
    appendTextDeltaSiblings(siblings, author, delta),
  )
  return markRoleActive(routed, author)
}

/**
 * Append a non-text part (tool card) to a specific role's block. The author
 * is derived server-side from the platform's function_call item id (see
 * `_toolCallAuthor` in responses_stream.ts). Falls back to the most recently
 * active subagent role if author is unknown — that handles Mode B where tool
 * cards land at root because no subagent blocks exist.
 */
function appendIntoRoleBlock(
  parts: AgentPart[],
  role: AgentAuthor,
  addition: AgentPart,
): AgentPart[] {
  return routeIntoRoleBlock(parts, role, (siblings) => [...siblings, addition])
}

/** Mark the matching role block as `running`, all others as `done`. Called
 * each time the platform announces a new active subagent. */
function markRoleActive(parts: AgentPart[], activeRole: AgentAuthor): AgentPart[] {
  let mutated = false
  const next = parts.map((p) => {
    if (p.kind !== "subagent") return p
    const desired: "running" | "done" = p.name === activeRole ? "running" : "done"
    if (p.status !== desired) {
      mutated = true
      return { ...p, status: desired }
    }
    return p
  })
  return mutated ? next : parts
}

/** Settle every still-running subagent block. Final cleanup at stream end. */
function closeAllOpenSubagentBanners(parts: AgentPart[]): AgentPart[] {
  let mutated = false
  const next = parts.map((p) => {
    if (p.kind === "subagent" && p.status === "running") {
      mutated = true
      return { ...p, status: "done" as const }
    }
    return p
  })
  return mutated ? next : parts
}

/** Concatenate every text part of an assistant turn into one string. */
function joinAgentText(parts: AgentPart[]): string {
  return parts
    .filter((p): p is Extract<AgentPart, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("\n\n")
}

/**
 * Build a compact memo of the most recent exchange. Sent verbatim to Haiku to
 * steer the next set of chip suggestions. We deliberately keep only the *last*
 * user/assistant pair — older context isn't worth the tokens, and the picker
 * config block already grounds the model on what data exists.
 *
 * Cap is generous (1200 chars ≈ ~300 tokens for the excerpt) so multi-paragraph
 * answers keep enough signal; the memo itself stays well under the cacheable
 * system + MCP block sizes and never approaches Haiku's context limit.
 */
const MEMO_AGENT_EXCERPT_CAP = 1200
function buildConversationMemo(messages: ChatMessage[]): string | null {
  let lastUserText: string | null = null
  let lastAgentText: string | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "agent" && lastAgentText === null) {
      const text = joinAgentText(m.parts).trim()
      if (text) lastAgentText = text
    } else if (m.role === "user" && lastUserText === null) {
      lastUserText = m.text.trim()
    }
    if (lastUserText !== null && lastAgentText !== null) break
  }
  if (lastUserText === null && lastAgentText === null) return null

  const lines: string[] = []
  if (lastUserText) lines.push(`User asked: ${lastUserText}`)
  if (lastAgentText) {
    const excerpt =
      lastAgentText.length > MEMO_AGENT_EXCERPT_CAP
        ? `${lastAgentText.slice(0, MEMO_AGENT_EXCERPT_CAP - 1).trimEnd()}…`
        : lastAgentText
    lines.push(`Agent answered (excerpt): ${excerpt}`)
  }
  return lines.join("\n")
}

/**
 * Apply an updater to the tool entry whose toolUseId matches. Recurses into
 * subagent blocks: when a tool is dispatched inside an open subagent block,
 * the settle event arrives later (sometimes after the block closed in Mode A)
 * and must still find the card by id.
 */
function updateToolPart(
  parts: AgentPart[],
  toolUseId: string,
  updater: (t: AgentTool) => AgentTool,
): AgentPart[] {
  return parts.map((p) => {
    if (p.kind === "tool" && p.tool.toolUseId === toolUseId) {
      return { kind: "tool", tool: updater(p.tool) }
    }
    if (p.kind === "subagent") {
      return { ...p, children: updateToolPart(p.children, toolUseId, updater) }
    }
    return p
  })
}

export interface OrchestratorState {
  // upstream data hooks
  config: UseConfigResult
  // mode
  mode: Mode
  pendingMode: Mode | null
  setPendingMode: (m: Mode | null) => void
  onRequestSwitch: (target: Mode) => void
  confirmSwitch: () => void
  // chat
  messages: ChatMessage[]
  timeline: Timeline
  railActive: boolean
  input: string
  setInput: (s: string) => void
  pressed: number | null
  onChip: (text: string, idx: number) => void
  runAgent: (query: string) => Promise<void>
  // observability (lifted)
  counters: Counters
  royHist: number[]
  feed: TapeRow[]
  attribution: AttributionRow[]
  pulse: ObservabilityPulse
  feedFlash: number
  cfgPulse: number
  sessionRoyalty: number
  // configuration toggles + save
  onToggleDataset: (clusterId: number, datasetId: number) => void
  onToggleCluster: (clusterId: number) => void
  onToggleConnector: (connectorId: number) => void
  onSaveConfig: () => Promise<void>
  // derived counts
  dsClusterCount: number
  apiSelectedCount: number
  // reset
  reset: () => void
  // chip-row prompt suggestions (Haiku-backed, MCP- and conversation-aware)
  suggestions: string[]
  suggestionsStatus: SuggestionsStatus
}

export interface UseOrchestratorStateOptions {
  /** Per-suggestion character cap. Mobile passes a tighter value (≤ ~55). */
  suggestionsLengthHint?: number
}

/**
 * The single hook shared by both desktop and mobile shells. Lifting orchestrator
 * state up here means the panel components stay presentational, and switching
 * between mounts on viewport changes is the only place state is lost.
 */
export function useOrchestratorState(options: UseOrchestratorStateOptions = {}): OrchestratorState {
  const { suggestionsLengthHint } = options
  const config = useConfig()
  const pricing = usePricing()
  const events = useDemoEvents()
  const { mode, setMode } = useMode()

  const uidRef = useRef(1000)
  const nid = useCallback(() => {
    uidRef.current += 1
    return uidRef.current
  }, [])

  const [messages, setMessages] = useState<ChatMessage[]>([])
  // runModeB's closure is memoised; without a ref it would only ever see the
  // empty history captured at first render, defeating multi-turn chat.
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages
  // Suggestions feature: compact memo + monotonic counter the suggestions
  // hook reads as its regeneration trigger. The counter bumps on each
  // streaming → idle transition so we generate a fresh set per turn without
  // re-running while deltas are still landing.
  const [conversationMemo, setConversationMemo] = useState<string | null>(null)
  const [turnCounter, setTurnCounter] = useState(0)
  const isStreaming = useMemo(
    () => messages.some((m) => m.role === "agent" && m.streaming),
    [messages],
  )
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setConversationMemo(buildConversationMemo(messagesRef.current))
      setTurnCounter((n) => n + 1)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])
  const [timeline, setTimeline] = useState<Timeline>({ ...DONE3 })
  const [railActive, setRailActive] = useState(false)
  const [input, setInput] = useState("")
  const [pressed, setPressed] = useState<number | null>(null)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  const [cfgPulse, setCfgPulse] = useState(0)

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

  useEffect(() => {
    setRoyHist((h) => [...h.slice(-(ROY_HIST_LEN - 1)), counters.royalties])
  }, [counters.royalties])
  const sessionRoyalty = counters.royalties

  // `tool-call` is the "ping": the call left the SDK, but we don't yet know
  // what datasets it touched or what it cost. Bump apiCalls, drop a placeholder
  // tape row (uid = toolUseId or timestamp so `tool-result` can find it later).
  useDemoEventListener("tool-call", (event) => {
    const ts = new Date(event.timestamp)
    const rowUid = event.toolUseId ?? String(event.timestamp)
    const row: TapeRow = {
      uid: rowUid,
      t: `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`,
      tool: formatTapeTool(event.toolName, event.args),
      meta: formatTapeMeta(event.tokensEstimate, 0, event.attributionLabel),
      fresh: true,
    }
    window.setTimeout(() => {
      setFeed((prev) =>
        [row, ...prev.map((r) => ({ ...r, fresh: false }))].slice(0, MAX_TAPE_BUFFER),
      )
    }, 100)
    window.setTimeout(() => {
      setCounters((c) => ({ ...c, apiCalls: c.apiCalls + 1 }))
    }, 200)
  })

  // `tool-result` is the settlement: we know the actual datasets touched, the
  // real hit count, and the per-cluster royalty breakdown. Update dataPoints +
  // royalties + per-cluster attribution from this event only.
  useDemoEventListener("tool-result", (event) => {
    // Patch the placeholder tape row with the real outcome. Errored calls
    // still patch the row (so it stops showing the dispatch-time "no price ·
    // 0 hits" forever) but render "error" instead of fake hit counts, and
    // contribute nothing to counters / attribution.
    setFeed((prev) => {
      const meta = event.isError
        ? formatTapeMeta(0, 0, `${event.toolName} · error`)
        : (() => {
            const label = event.attributionRows[0]?.attributionLabel ?? event.toolName
            return formatTapeMeta(0, event.royaltyEur, `${label} · ${event.hits} hits`)
          })()
      return prev.map((r) => (r.uid === event.toolUseId ? { ...r, meta, fresh: true } : r))
    })
    if (event.isError) return
    // No floor on hits — listings (`list_datasets`, `get_dataset`) genuinely
    // return zero data points and should not inflate the counter. Search
    // and `get_entry_*` callers report their real hit count via the
    // settlement logic.
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
      const last = event.attributionRows[event.attributionRows.length - 1]
      setPulse((p) => ({
        ...p,
        attr: { key: last.attributionKey, n: p.attr ? p.attr.n + 1 : 1, amount: event.royaltyEur },
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

  const runningRef = useRef(false)
  const cancelRef = useRef(false)
  const sourcesRef = useRef(config.sources)
  sourcesRef.current = config.sources
  const computeRoyaltyRef = useRef(pricing.computeRoyalty)
  computeRoyaltyRef.current = pricing.computeRoyalty

  // Per-tool-call dispatch info, keyed by toolUseId. Populated at
  // tool-use-start when we resolve the source against the catalog; read at
  // tool-result so we can route API/proxied tools through API royalty +
  // connector attribution, instead of the dataset-id walker that always
  // comes up empty for non-dataset payloads.
  const toolDispatchRef = useRef<
    Map<
      string,
      {
        kind: "dataset" | "api"
        toolName: string
        connectorId: number | null
        connectorName: string | null
        /** Raw args captured at dispatch time. The result-side settle path
         * uses these to recover an `entry_id` when a `datacluster_get_entry_*`
         * tool returns a payload that omits `dataset_id` — without the args
         * the call would attribute to nothing and look free. */
        args: Record<string, unknown> | null
      }
    >
  >(new Map())

  // Session-wide `entry_id → dataset_id` map, fed by every tool-result that
  // surfaces both fields together (search results, list_entries). Used to bill
  // `get_entry_*` follow-ups whose payloads only echo `entry_id` — one hit at
  // the resolved dataset's price.
  const entryToDatasetRef = useRef<Map<number, number>>(new Map())

  const addUserMessage = useCallback(
    (text: string) => {
      const uid = nid()
      setMessages((ms) => [...ms, { uid, role: "user", text }])
      return uid
    },
    [nid],
  )
  const addAgentMessage = useCallback(
    (sender: string) => {
      const uid = nid()
      setMessages((ms) => [
        ...ms,
        {
          uid,
          role: "agent",
          sender,
          parts: [],
          streaming: true,
          fresh: false,
        },
      ])
      return uid
    },
    [nid],
  )
  const addScopeMessage = useCallback(
    (text: string) => {
      const uid = nid()
      setMessages((ms) => [...ms, { uid, role: "scope", text }])
      return uid
    },
    [nid],
  )
  const setAgentMessage = useCallback(
    (
      agentUid: number,
      updater: (
        m: Extract<ChatMessage, { role: "agent" }>,
      ) => Extract<ChatMessage, { role: "agent" }>,
    ) => {
      setMessages((ms) =>
        ms.map((m) => (m.uid === agentUid && m.role === "agent" ? updater(m) : m)),
      )
    },
    [],
  )

  const dispatchToolCall = useCallback(
    (
      toolName: string,
      args: Record<string, unknown> | null,
      toolUseId: string | null,
      agentUid: number,
      /** Mode A: subagent role that issued the call (decoded server-side from
       * the function_call item id). Mode B passes `null` — tool cards land
       * at the root, no subagent blocks exist there. */
      author: AgentAuthor | null = null,
    ) => {
      const sources = sourcesRef.current
      const source = resolveToolSource(sources, toolName)
      const ts = Date.now()
      let kind: "dataset" | "api"
      let attributionKey: string
      let attributionLabel: string
      let connectorId: number | null = null
      if (source?.kind === "dataset") {
        kind = "dataset"
        attributionKey = `cluster:${source.cluster.cluster_id}`
        attributionLabel = source.cluster.name
      } else if (source?.kind === "api") {
        kind = "api"
        attributionKey = `connector:${source.connector.connector_id}`
        attributionLabel = source.connector.name
        connectorId = source.connector.connector_id
      } else {
        kind = "dataset"
        attributionKey = `tool:${toolName}`
        attributionLabel = toolName
      }
      events.emit({
        type: "tool-call",
        toolUseId,
        toolName,
        args,
        kind,
        connectorId,
        attributionKey,
        attributionLabel,
        tokensEstimate: 0,
        timestamp: ts,
      })
      // Remember the dispatch source so tool-result can route by kind. Without
      // this, API-tool results always fall through to the dataset-id walker
      // and come back as "0 hits / no price / tool" rows.
      if (toolUseId) {
        toolDispatchRef.current.set(toolUseId, {
          kind,
          toolName,
          connectorId,
          connectorName: source?.kind === "api" ? source.connector.name : null,
          args,
        })
      }
      // For federated MCP tools (same tool name in many clusters), the
      // catalog-resolved label is a guess at dispatch time. Show a placeholder
      // and patch it in the tool-result handler once we know the real cluster.
      const initialSummary = source?.kind === "api" ? attributionLabel : "…"
      const toolPart: AgentPart = {
        kind: "tool",
        tool: {
          toolUseId,
          icon: kind === "dataset" ? "search" : "plug",
          name: toolName,
          summary: initialSummary,
          args: JSON.stringify(args ?? {}, null, 2),
          result: "",
          running: true,
          startedAt: ts,
        },
      }
      setAgentMessage(agentUid, (m) => ({
        ...m,
        fresh: true,
        // Mode A: nest the tool card inside the issuing subagent's role block
        // (Specialist in practice — Planner doesn't dispatch tools). Mode B:
        // author is null, tool card sits at the root.
        parts:
          author === null ? [...m.parts, toolPart] : appendIntoRoleBlock(m.parts, author, toolPart),
      }))
    },
    [events, setAgentMessage],
  )

  // Build cluster_id → AvailableCluster lookup so we can attribute datasets
  // back to their owning cluster when only dataset_ids are returned.
  const datasetToClusterRef = useRef<Map<number, { clusterId: number; clusterName: string }>>(
    new Map(),
  )
  useEffect(() => {
    const map = new Map<number, { clusterId: number; clusterName: string }>()
    if (config.sources) {
      for (const cluster of config.sources.clusters) {
        for (const dataset of cluster.datasets) {
          map.set(dataset.id, { clusterId: cluster.cluster_id, clusterName: cluster.name })
        }
      }
    }
    datasetToClusterRef.current = map
  }, [config.sources])

  // Given a tool result's extracted IDs, build per-cluster attribution rows.
  // Royalty for each touched dataset is `Dataset.access_price × entries_returned`
  // — pricing is per data hit, not per dataset listing. Tools that return
  // dataset metadata only (`list_datasets`, `get_dataset`) hand back zero
  // entries; those calls are FREE — we still emit attribution rows so the
  // source shows up in the panel, but with €0 and 0 hits. Only the
  // `get_entry_*` and search callers — which DO touch underlying data — pre-
  // populate `entriesPerDataset` (search via the result walker, get_entry_*
  // via the composite-id synthesizer above), so they get billed correctly.
  const buildAttributionRows = useCallback(
    (
      meta: {
        clusterIds: number[]
        datasetIds: number[]
        entriesPerDataset?: Record<number, number>
      },
      fallbackLabel: string,
    ): Array<{
      attributionKey: string
      attributionLabel: string
      clusterId: number | null
      royaltyEur: number
      datasetIds: number[]
    }> => {
      const pricing = computeRoyaltyRef.current
      const datasetToCluster = datasetToClusterRef.current
      const sources = sourcesRef.current
      const entriesPerDataset = meta.entriesPerDataset ?? {}
      const byCluster = new Map<
        number,
        { name: string; datasetIds: number[]; royaltyEur: number }
      >()

      // Seed buckets from clusterIds (so empty datasetIds still gets a row).
      for (const cid of meta.clusterIds) {
        const cat = sources?.clusters.find((c) => c.cluster_id === cid)
        if (!byCluster.has(cid)) {
          byCluster.set(cid, {
            name: cat?.name ?? `cluster ${cid}`,
            datasetIds: [],
            royaltyEur: 0,
          })
        }
      }

      // Assign each dataset_id to its cluster bucket, summing pricing.
      for (const did of meta.datasetIds) {
        const link = datasetToCluster.get(did)
        const cid = link?.clusterId ?? meta.clusterIds[0] ?? -1
        const name =
          link?.clusterName ??
          sources?.clusters.find((c) => c.cluster_id === cid)?.name ??
          (cid === -1 ? fallbackLabel : `cluster ${cid}`)
        const bucket = byCluster.get(cid) ?? { name, datasetIds: [], royaltyEur: 0 }
        bucket.datasetIds.push(did)
        // Price lookup uses the same map computeRoyalty consumes.
        const { royaltyEur: pricePerHit } = pricing(
          "dataset_id_only",
          { dataset_ids: [did] },
          "dataset",
        )
        // No entries returned = no data accessed = no charge. The dataset
        // still gets a row (so the cluster appears in the attribution panel),
        // it just contributes €0 to the running total.
        const hitCount = entriesPerDataset[did] ?? 0
        bucket.royaltyEur = round4(bucket.royaltyEur + pricePerHit * hitCount)
        byCluster.set(cid, bucket)
      }

      // Only emit rows that resolve to a real cluster. A dataset search that
      // returned zero results leaves byCluster empty — we used to push a
      // phantom `tool:<name>` row at €0 here, but that polluted the Royalties
      // Per Source panel with entries like `datacluster_keyword_search` and
      // `tool` for calls that touched nothing. The call is already counted
      // in API Calls via `tool-call`; no attribution row is the right answer.
      return Array.from(byCluster.entries())
        .filter(([cid]) => cid >= 0)
        .map(([cid, b]) => ({
          attributionKey: `cluster:${cid}`,
          attributionLabel: b.name,
          clusterId: cid,
          royaltyEur: b.royaltyEur,
          datasetIds: b.datasetIds,
        }))
    },
    [],
  )

  // Shared tool-result settlement. Both Mode A and Mode B need to (a) flip the
  // tool card to running:false, (b) compute royalty attribution rows from the
  // dispatch ref + result content, (c) emit the bus `tool-result` for the
  // observability cascade. Mode B passes real `content` (and may set isError);
  // Mode A omits `content` because the platform never echoes a function_call
  // output payload back through the responses stream.
  const settleToolCall = useCallback(
    (
      agentUid: number,
      toolUseId: string,
      opts: {
        content?: unknown
        isError?: boolean
        fallbackToolName?: string | null
      } = {},
    ) => {
      const { content, isError = false, fallbackToolName = null } = opts
      const dispatch = toolDispatchRef.current.get(toolUseId)
      toolDispatchRef.current.delete(toolUseId)

      let rows: ReturnType<typeof buildAttributionRows>
      let hits: number
      if (isError) {
        rows = []
        hits = 0
      } else if (dispatch?.kind === "api" && dispatch.connectorId !== null) {
        const { royaltyEur } = computeRoyaltyRef.current(dispatch.toolName, null, "api")
        rows = [
          {
            attributionKey: `connector:${dispatch.connectorId}`,
            attributionLabel: dispatch.connectorName ?? dispatch.toolName,
            clusterId: null,
            royaltyEur,
            datasetIds: [],
          },
        ]
        hits = 1
      } else if (content !== undefined) {
        const meta = extractResultMeta(content)
        // Feed the session-wide entry→dataset cache from any pairs the result
        // surfaced, so subsequent `get_entry_*` calls can resolve their dataset.
        for (const [eid, did] of Object.entries(meta.entryToDataset)) {
          entryToDatasetRef.current.set(Number(eid), did)
        }
        // The new `datacluster_get_entry_*` tools take a single
        // `composite_id` string ("clusterId:datasetId:entryId") instead of a
        // numeric `entry_id`, AND their response payloads omit the raw IDs.
        // The dataset is embedded right in the arg, so we recover attribution
        // by parsing it — no cache needed. Also feed the entry→dataset cache
        // for any future calls that DO miss.
        const composite = parseCompositeEntryArg(dispatch?.args ?? null)
        if (meta.datasetIds.length === 0 && composite !== null) {
          entryToDatasetRef.current.set(composite.entryId, composite.datasetId)
          const synthetic = {
            clusterIds: [composite.clusterId],
            datasetIds: [composite.datasetId],
            entriesPerDataset: { [composite.datasetId]: 1 },
          }
          rows = buildAttributionRows(synthetic, dispatch?.toolName ?? "tool")
          hits = 1
        } else if (meta.datasetIds.length === 0) {
          const requestedEntryId = extractEntryIdArg(dispatch?.args ?? null)
          const did =
            requestedEntryId !== null ? entryToDatasetRef.current.get(requestedEntryId) : undefined
          if (did !== undefined) {
            const synthetic = {
              clusterIds: meta.clusterIds,
              datasetIds: [did],
              entriesPerDataset: { [did]: 1 },
            }
            rows = buildAttributionRows(synthetic, dispatch?.toolName ?? "tool")
            hits = 1
          } else if (meta.entryIds.length > 0 || requestedEntryId !== null) {
            // Cache miss but an entry _did_ come back (or was requested by
            // id): we know the call wasn't free, we just can't resolve which
            // dataset to attribute it to. Book a flat €0.01 / 1 hit against
            // the tool itself rather than letting the call look gratis.
            const toolLabel = dispatch?.toolName ?? fallbackToolName ?? "tool"
            rows = [
              {
                attributionKey: `tool:${toolLabel}`,
                attributionLabel: toolLabel,
                clusterId: null,
                royaltyEur: 0.01,
                datasetIds: [],
              },
            ]
            hits = 1
          } else {
            rows = buildAttributionRows(meta, dispatch?.toolName ?? "tool")
            hits = sumEntries(meta.entriesPerDataset)
          }
        } else {
          rows = buildAttributionRows(meta, dispatch?.toolName ?? "tool")
          // Data points reflect *paid* entries actually fetched, not result
          // array length. `list_datasets` returns N dataset summaries with no
          // entry payload → `entriesPerDataset` is empty → hits = 0. Search
          // tools populate `entriesPerDataset` from result rows that carry
          // both `entry_id` and `dataset_id`, so this matches the result
          // count for them and the counter still ticks honestly.
          hits = sumEntries(meta.entriesPerDataset)
        }
      } else {
        rows = []
        hits = 0
      }

      const snippet = content !== undefined ? snippetForDisplay(content) : ""
      const newSummary =
        rows.length > 0
          ? rows.length === 1
            ? (rows[0]?.attributionLabel ?? "✓")
            : `${rows[0]?.attributionLabel} +${rows.length - 1}`
          : isError
            ? "error"
            : "✓"

      setAgentMessage(agentUid, (m) => ({
        ...m,
        parts: updateToolPart(m.parts, toolUseId, (t) => ({
          ...t,
          result: snippet,
          summary: newSummary,
          running: false,
        })),
      }))

      // Always emit a `tool-result` so the placeholder tape row gets patched
      // — even on errors. The previous behaviour suppressed the event on
      // `isError`, leaving the row stuck at its dispatch-time "no price · 0
      // hits" string for the lifetime of the demo. Listeners must inspect
      // `isError` and avoid crediting hits / royalties when set.
      const totalRoyalty = isError ? 0 : rows.reduce((sum, r) => round4(sum + r.royaltyEur), 0)
      events.emit({
        type: "tool-result",
        toolUseId,
        toolName: dispatch?.toolName ?? fallbackToolName ?? "",
        callTimestamp: Date.now(),
        attributionRows: isError ? [] : rows,
        royaltyEur: totalRoyalty,
        hits: isError ? 0 : hits,
        resultSnippet: snippet,
        isError,
      })
    },
    [buildAttributionRows, events, setAgentMessage],
  )

  // Backend Job id correlation arriving on `data-jobId` (see
  // responses_stream.ts). Kept in a ref so any post-turn lookup (e.g. retry,
  // diagnostics) can reach back to `GET /jobs/:id` without prop drilling.
  const modeAJobIdRef = useRef<number | null>(null)

  // Platform `response_id` from the most recent Mode A turn in this session.
  // Forwarded as `previousResponseId` on the next turn so the orchestrator
  // threads multi-turn memory (planner/specialist/critic conversation state +
  // tool history). Cleared on Reset and on mode switch — those start a fresh
  // platform agent runtime session.
  const modeAResponseIdRef = useRef<string | null>(null)

  // Replay the platform's per-job cost breakdown into the existing royalty
  // cascade. One synthetic `tool-result` event is emitted per attributable
  // brick — connectors and datasets only. LLM/compute/platform bricks are
  // ignored: LLM cost lives in the Usage panel via tokens; compute/platform
  // bricks are containers without a meaningful "source" attribution.
  //
  // The per-tool-call cascade (`settleToolCall` for API tools, line 711) has
  // already emitted €0 rows for each API call because the local OpenAIRE
  // pricing is set to 0. Emitting cost_breakdown rows with the same
  // `connector:<id>` key merges them additively via `upsertAttribution` (line
  // 102) — call counts inflate slightly but total € reflects the backend
  // truth. Dataset rows are pure addition because Mode A's per-call settle
  // emits nothing for datasets (no result body to walk for dataset_ids).
  const emitCostBreakdownRows = useCallback(
    (jobId: number, breakdown: CostBreakdownPayload) => {
      if (breakdown.status !== "complete" && breakdown.status !== "partial") return
      const datasetToCluster = datasetToClusterRef.current
      for (const brick of breakdown.bricks) {
        if (brick.cost_eur === 0) continue
        if (brick.category === "connector") {
          const u = brick.units ?? {}
          const connectorId =
            typeof u.connector_id === "number" || typeof u.connector_id === "string"
              ? String(u.connector_id)
              : brick.node_id
          const label =
            typeof u.tool_name === "string" && u.tool_name.length > 0
              ? u.tool_name
              : `connector ${connectorId}`
          events.emit({
            type: "tool-result",
            toolUseId: `brick:${brick.id}`,
            toolName: label,
            callTimestamp: Date.now(),
            attributionRows: [
              {
                attributionKey: `connector:${connectorId}`,
                attributionLabel: label,
                clusterId: null,
                royaltyEur: brick.cost_eur,
                datasetIds: [],
              },
            ],
            royaltyEur: brick.cost_eur,
            hits: typeof u.call_count === "number" ? u.call_count : 1,
            resultSnippet: "",
            isError: false,
          })
          continue
        }
        if (brick.category === "dataset") {
          const u = brick.units ?? {}
          const datasetId = typeof u.dataset_id === "number" ? u.dataset_id : null
          if (datasetId === null) continue
          const link = datasetToCluster.get(datasetId)
          const clusterId = link?.clusterId ?? null
          const label = link?.clusterName ?? `dataset ${datasetId}`
          // Match Mode B's per-cluster bucket key so the Royalties Per Source
          // panel rolls up identically across modes.
          const attributionKey =
            clusterId !== null ? `cluster:${clusterId}` : `dataset:${datasetId}`
          events.emit({
            type: "tool-result",
            toolUseId: `brick:${brick.id}`,
            toolName: label,
            callTimestamp: Date.now(),
            attributionRows: [
              {
                attributionKey,
                attributionLabel: label,
                clusterId,
                royaltyEur: brick.cost_eur,
                datasetIds: [datasetId],
              },
            ],
            royaltyEur: brick.cost_eur,
            hits: typeof u.access_count === "number" ? u.access_count : 1,
            resultSnippet: "",
            isError: false,
          })
        }
      }
      console.debug(
        `[mode-a] cost breakdown for job ${jobId}: ${breakdown.bricks.length} bricks, status=${breakdown.status}`,
      )
    },
    [events],
  )

  const runModeATurn = useCallback(
    async (query: string, agentUid: number) => {
      const previousResponseId = modeAResponseIdRef.current
      console.log(
        `[mode-a hook] ▶ runModeATurn agentUid=${agentUid} previousResponseId=${previousResponseId ?? "—"}`,
      )
      // Per-author text-delta byte counter so the end-of-turn summary shows
      // who actually spoke how much.
      const textBytesByAuthor: Record<string, number> = {}
      let toolCallCount = 0
      let toolResultCount = 0
      let subagentStarts = 0
      let subagentEnds = 0
      try {
        await runModeA({
          query,
          cancelRef,
          previousResponseId: previousResponseId ?? undefined,
          callbacks: {
            onAuthorText: (author, delta) => {
              textBytesByAuthor[author] = (textBytesByAuthor[author] ?? 0) + delta.length
              // Append to the latest text part if same author, else open a
              // new author-labeled text part. Subagent text routes into the
              // role block via appendAuthorTextDelta; MAIN text lands at
              // root.
              setAgentMessage(agentUid, (m) => ({
                ...m,
                parts: appendAuthorTextDelta(m.parts, author, delta),
                streaming: true,
                faded: false,
              }))
            },
            onSubagentStart: (name) => {
              subagentStarts += 1
              console.log(`[mode-a hook] onSubagentStart name=${name}`)
              setAgentMessage(agentUid, (m) => ({
                ...m,
                parts: markRoleActive(
                  routeIntoRoleBlock(m.parts, name, (siblings) => siblings),
                  name,
                ),
                streaming: true,
              }))
            },
            onSubagentEnd: () => {
              subagentEnds += 1
              // No-op. The platform fires data-subagent-end at the boundary of
              // every internal orchestrator cycle; we don't act on each one
              // because we collapse repeats into a single role block. Final
              // cleanup happens in onStreamEnd.
            },
            onToolCall: (toolUseId, toolName, args, author) => {
              toolCallCount += 1
              console.log(
                `[mode-a hook] onToolCall #${toolCallCount} tool=${toolName} id=${toolUseId} author=${author ?? "—"}`,
              )
              // Tool calls always come from Specialist in the agentic prompt,
              // but we route by the server-decoded author regardless.
              dispatchToolCall(toolName, args, toolUseId, agentUid, author)
            },
            onToolResult: (toolUseId, fallbackName) => {
              toolResultCount += 1
              console.log(
                `[mode-a hook] onToolResult #${toolResultCount} id=${toolUseId} fallback=${fallbackName ?? "—"}`,
              )
              settleToolCall(agentUid, toolUseId, { fallbackToolName: fallbackName })
            },
            onJobId: (jobId) => {
              console.log(`[mode-a hook] onJobId ${jobId} (stashed in modeAJobIdRef)`)
              modeAJobIdRef.current = jobId
            },
            onResponseId: (responseId) => {
              console.log(
                `[mode-a hook] onResponseId ${responseId} (stashed for next turn's previousResponseId)`,
              )
              modeAResponseIdRef.current = responseId
            },
            onCostBreakdown: (jobId, breakdown) => {
              console.log(
                `[mode-a hook] onCostBreakdown jobId=${jobId} bricks=${breakdown.bricks.length} status=${breakdown.status}`,
              )
              emitCostBreakdownRows(jobId, breakdown)
            },
            onSubagentSeen: (() => {
              const ranks: Record<string, number> = { planner: 0, specialist: 1, critic: 2 }
              let stage = -1
              return (name: string) => {
                const next = ranks[name]
                if (next === undefined) return
                if (next <= stage) return
                const prevStage = stage
                stage = next
                console.log(
                  `[mode-a hook] onSubagentSeen rail advance ${prevStage}→${next} (${name})`,
                )
                if (name === "planner") {
                  setTimeline({ planner: "exec", specialist: "pending", critic: "pending" })
                } else if (name === "specialist") {
                  setTimeline({ planner: "done", specialist: "exec", critic: "pending" })
                } else {
                  setTimeline({ planner: "done", specialist: "done", critic: "exec" })
                }
              }
            })(),
            onFinish: () => {
              console.log(`[mode-a hook] onFinish (clean) — flipping streaming=false + DONE3 rail`)
              setAgentMessage(agentUid, (m) => ({
                ...m,
                parts: closeAllOpenSubagentBanners(m.parts),
                streaming: false,
              }))
              setTimeline({ ...DONE3 })
            },
            onStreamEnd: () => {
              const bytes = Object.entries(textBytesByAuthor)
                .sort(([, a], [, b]) => b - a)
                .map(([k, v]) => `${k}=${v}b`)
                .join(" ")
              console.log(
                `[mode-a hook] ◀ onStreamEnd — text-by-author: ${bytes || "none"} | tools=${toolCallCount}/${toolResultCount} (call/result) | subagents=${subagentStarts}/${subagentEnds} (start/end)`,
              )
              setAgentMessage(agentUid, (m) => ({
                ...m,
                parts: closeAllOpenSubagentBanners(m.parts),
                streaming: false,
              }))
            },
          },
        })
      } catch (err) {
        console.error(
          `[mode-a hook] ✗ runModeATurn THREW:`,
          err instanceof Error ? (err.stack ?? err.message) : err,
        )
        throw err
      }
    },
    [dispatchToolCall, emitCostBreakdownRows, setAgentMessage, settleToolCall],
  )

  const runModeBTurn = useCallback(
    async (query: string, agentUid: number) => {
      // Build conversation history from previously-committed turns. The new
      // user message hasn't landed in messagesRef yet (addUserMessage is
      // async-scheduled), so it gets appended inside runModeB.
      const history = messagesRef.current
        .map((m) => {
          if (m.role === "user") {
            return { role: "user" as const, content: m.text }
          }
          if (m.role === "agent") {
            const text = joinAgentText(m.parts)
            if (!text) return null
            return { role: "assistant" as const, content: text }
          }
          return null
        })
        .filter((x): x is { role: "user" | "assistant"; content: string } => x !== null)

      await runModeB({
        query,
        history,
        cancelRef,
        callbacks: {
          onAssistantText: (delta) => {
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: appendTextDelta(m.parts, delta),
              streaming: true,
              faded: false,
            }))
          },
          onThinkingText: (delta) => {
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: appendDelta(m.parts, "thinking", delta),
              streaming: true,
            }))
          },
          onToolUseStart: (toolUseId, toolName) => {
            dispatchToolCall(toolName, null, toolUseId, agentUid)
          },
          onToolUseInputResolved: (toolUseId, args) => {
            if (!args) return
            // Backfill the dispatch record with the resolved input. Mode B
            // calls `onToolUseStart` *before* the args stream arrives, so the
            // dispatch was registered with `args: null`. Without this patch,
            // the result-side `settleToolCall` can't recover `entry_id` from
            // the args, and `get_entry_*` tools whose payload omits
            // `dataset_id` (or that error out) attribute to nothing.
            const existing = toolDispatchRef.current.get(toolUseId)
            if (existing) {
              toolDispatchRef.current.set(toolUseId, { ...existing, args })
            }
            const argsStr = JSON.stringify(args, null, 2)
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: updateToolPart(m.parts, toolUseId, (t) => ({
                ...t,
                args: argsStr,
              })),
            }))
          },
          onToolResult: (toolUseId, content, isError) => {
            settleToolCall(agentUid, toolUseId, { content, isError })
          },
          onUsage: (usage) => {
            events.emit({
              type: "usage",
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.inputTokens + usage.outputTokens,
            })
          },
          onError: (message) => {
            console.error("[mode-b] stream error:", message)
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: appendTextDelta(m.parts, `\n\n_Turn failed: ${message}._`),
              streaming: false,
            }))
          },
          onStreamEnd: () => {
            setAgentMessage(agentUid, (m) => ({ ...m, streaming: false }))
          },
        },
      })
    },
    [dispatchToolCall, events, setAgentMessage, settleToolCall],
  )

  const runAgent = useCallback(
    async (query: string) => {
      if (runningRef.current) return
      runningRef.current = true
      cancelRef.current = false
      const agentic = mode === "agentic"
      setInput("")
      addUserMessage(query)
      const agentUid = addAgentMessage(agentic ? "DeepAgent" : "Claude")
      if (agentic) {
        setRailActive(true)
        setTimeline({ planner: "exec", specialist: "pending", critic: "pending" })
      }
      try {
        if (agentic) await runModeATurn(query, agentUid)
        else await runModeBTurn(query, agentUid)
      } catch (err) {
        console.error("[demo] live turn failed:", err)
        const msg = err instanceof Error ? err.message : String(err)
        setAgentMessage(agentUid, (m) => ({
          ...m,
          streaming: false,
          parts: appendTextDelta(m.parts, `\n\n_Turn failed: ${msg}._`),
        }))
      } finally {
        if (agentic) setTimeline({ ...DONE3 })
        runningRef.current = false
      }
    },
    [addAgentMessage, addUserMessage, mode, runModeATurn, runModeBTurn, setAgentMessage],
  )

  // Expose `runAgent` to the chip-click handler defined earlier. Using a ref
  // sidesteps the chicken-and-egg between `onChip` (declared up the file so
  // the suggestions hook can be wired before `runAgent`) and `runAgent`
  // itself (which needs `runModeATurn` / `runModeBTurn` to be defined first).
  useEffect(() => {
    runAgentRef.current = runAgent
  }, [runAgent])

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
      const scopeUid = addScopeMessage("Configuration updated · applying…")
      window.setTimeout(() => {
        setMessages((ms) => ms.filter((m) => m.uid !== scopeUid))
      }, 3400)
    } catch (err) {
      console.error("[demo] save failed:", err)
      addScopeMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [addScopeMessage, config, events])

  const onRequestSwitch = useCallback(
    (target: Mode) => {
      if (target === mode) return
      if (messages.length === 0 && !runningRef.current) {
        setMode(target)
      } else {
        setPendingMode(target)
      }
    },
    [messages.length, mode, setMode],
  )

  const confirmSwitch = useCallback(() => {
    const target = pendingMode
    if (!target) return
    setPendingMode(null)
    cancelRef.current = true
    runningRef.current = false
    setMode(target)
    setMessages([])
    setTimeline({ ...DONE3 })
    setRailActive(false)
    setInput("")
    setPressed(null)
    // Mode switch = fresh platform session. Drop the prior Mode A response_id
    // so the next Agentic turn starts on a clean orchestrator runtime.
    modeAResponseIdRef.current = null
    modeAJobIdRef.current = null
    setConversationMemo(null)
    setTurnCounter((n) => n + 1)
    events.emit({ type: "reset-chat" })
  }, [events, pendingMode, setMode])

  const reset = useCallback(() => {
    cancelRef.current = true
    runningRef.current = false
    setMode("dataflow")
    setMessages([])
    setTimeline({ ...DONE3 })
    setRailActive(false)
    setInput("")
    setPressed(null)
    setPendingMode(null)
    // Reset = fresh platform session; clear any threaded Mode A state so the
    // next Agentic turn doesn't inherit memory from the dropped chat.
    modeAResponseIdRef.current = null
    modeAJobIdRef.current = null
    setConversationMemo(null)
    setTurnCounter((n) => n + 1)
    config.reset()
    events.emit({ type: "reset-chat" })
  }, [config, events, setMode])

  // Chip-row prompt suggestions, driven by the connected MCP config + the
  // memo of the last exchange. The hook owns its own debounce, abort, and
  // error states; we only feed it inputs.
  const { suggestions, status: suggestionsStatus } = useDynamicSuggestions({
    mode,
    view: config.view,
    memo: conversationMemo,
    turnCounter,
    isStreaming,
    lengthHint: suggestionsLengthHint,
  })

  // Clicking a chip fires the prompt immediately — auto-send beats the
  // populate-then-press pattern for short tappable openers. `runAgent` is
  // declared below; bound via a ref to dodge the declaration order.
  const runAgentRef = useRef<((q: string) => Promise<void>) | null>(null)
  const onChip = useCallback((text: string, idx: number) => {
    setPressed(idx)
    setTimeout(() => setPressed(null), 240)
    const run = runAgentRef.current
    if (run) {
      void run(text)
    } else {
      // Hook hasn't finished mounting yet — preserve the original behaviour
      // (drop text into the composer) so the click is never wholly lost.
      setInput(text)
    }
  }, [])

  // Count clusters with at least one dataset selected — NOT the full catalog
  // (which is fixed regardless of the picker state and would never decrement
  // when the user unchecks things).
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
    input,
    setInput,
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
