"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Timeline } from "@/components/panels/agent"
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
  return [
    ...parts,
    { kind: "subagent", name: role, status: "running", children: mutator([]) },
  ]
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
}

/**
 * The single hook shared by both desktop and mobile shells. Lifting orchestrator
 * state up here means the panel components stay presentational, and switching
 * between mounts on viewport changes is the only place state is lost.
 */
export function useOrchestratorState(): OrchestratorState {
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
    // Patch the placeholder tape row with the real royalty + attribution.
    setFeed((prev) => {
      const label = event.attributionRows[0]?.attributionLabel ?? event.toolName
      const meta = formatTapeMeta(0, event.royaltyEur, `${label} · ${event.hits} hits`)
      return prev.map((r) => (r.uid === event.toolUseId ? { ...r, meta, fresh: true } : r))
    })
    setCounters((c) => ({
      apiCalls: c.apiCalls,
      dataPoints: c.dataPoints + Math.max(1, event.hits),
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
      }
    >
  >(new Map())

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
          author === null
            ? [...m.parts, toolPart]
            : appendIntoRoleBlock(m.parts, author, toolPart),
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

  // Given a tool result's extracted IDs, build per-cluster attribution rows
  // with royalty summed from `dataset:<id>` pricing entries.
  const buildAttributionRows = useCallback(
    (
      meta: { clusterIds: number[]; datasetIds: number[] },
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
        const { royaltyEur } = pricing("dataset_id_only", { dataset_ids: [did] }, "dataset")
        bucket.royaltyEur = round4(bucket.royaltyEur + royaltyEur)
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
        rows = buildAttributionRows(meta, dispatch?.toolName ?? "tool")
        hits = meta.hits
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

      if (!isError) {
        const totalRoyalty = rows.reduce((sum, r) => round4(sum + r.royaltyEur), 0)
        events.emit({
          type: "tool-result",
          toolUseId,
          toolName: dispatch?.toolName ?? fallbackToolName ?? "",
          callTimestamp: Date.now(),
          attributionRows: rows,
          royaltyEur: totalRoyalty,
          hits,
          resultSnippet: snippet,
        })
      }
    },
    [buildAttributionRows, events, setAgentMessage],
  )

  const runModeATurn = useCallback(
    async (query: string, agentUid: number) => {
      await runModeA({
        query,
        cancelRef,
        callbacks: {
          onAuthorText: (author, delta) => {
            // Append to the latest text part if it's by the same author,
            // otherwise open a new author-labeled text part. This keeps text
            // and tool cards chronologically interleaved AND labelled, so the
            // user sees "Planner [...] / Specialist [...] / tool call / [...]
            // / Critic [verdict] / Synthesis".
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: appendAuthorTextDelta(m.parts, author, delta),
              streaming: true,
              faded: false,
            }))
          },
          onSubagentStart: (name) => {
            // "One block per role" layout: ensure a block exists for this
            // role (no-op if it already does), and mark this role as the
            // currently-active one (others flip to done). Same-author repeat
            // activations during the same turn keep accumulating into the
            // same block.
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
            // No-op. The platform fires data-subagent-end at the boundary of
            // every internal orchestrator cycle (dozens of times per turn);
            // we don't act on each one because we collapse repeats into a
            // single role block. Final cleanup happens in onStreamEnd.
          },
          onToolCall: (toolUseId, toolName, args, author) => {
            // Tool calls always come from Specialist in the agentic prompt,
            // but we route by the server-decoded author regardless. If author
            // is null we drop the call to the most recently active role —
            // safer than silently landing at root.
            dispatchToolCall(toolName, args, toolUseId, agentUid, author)
          },
          onToolResult: (toolUseId, fallbackName) => {
            settleToolCall(agentUid, toolUseId, { fallbackToolName: fallbackName })
          },
          onSubagentSeen: (() => {
            // Monotonic advance: once we've seen a downstream subagent, we
            // don't "rewind" the rail even if the orchestrator loops back.
            //   planner   → 0
            //   specialist → 1
            //   critic     → 2
            const ranks: Record<string, number> = { planner: 0, specialist: 1, critic: 2 }
            let stage = -1
            return (name: string) => {
              const next = ranks[name]
              if (next === undefined) return
              if (next <= stage) return
              stage = next
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
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: closeAllOpenSubagentBanners(m.parts),
              streaming: false,
            }))
            setTimeline({ ...DONE3 })
          },
          onStreamEnd: () => {
            setAgentMessage(agentUid, (m) => ({
              ...m,
              parts: closeAllOpenSubagentBanners(m.parts),
              streaming: false,
            }))
          },
        },
      })
    },
    [dispatchToolCall, setAgentMessage, settleToolCall],
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
    config.reset()
    events.emit({ type: "reset-chat" })
  }, [config, events, setMode])

  const onChip = useCallback((text: string, idx: number) => {
    setPressed(idx)
    setInput(text)
    setTimeout(() => setPressed(null), 240)
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
  }
}

export const MODEL = "Claude Sonnet 4.6"

export const SUGGESTIONS: Record<Mode, string[]> = {
  dataflow: [
    "Summarize today's neuroscience preprint activity",
    "Cross-reference with my private notes",
    "Draft a literature review with citations",
  ],
  agentic: [
    "Plan a systematic review of recent D2 antagonist trials",
    "Reconcile preprint claims against my clinical cohort",
    "Build an evidence table with citations and gaps",
  ],
}

export const EMPTY_STATE: Record<Mode, string> = {
  dataflow: "Live chat on the active MCP Configuration. Every read is metered and attributed.",
  agentic: "Live workflow on the active MCP Configuration. Give the planner a multi-step task.",
}
