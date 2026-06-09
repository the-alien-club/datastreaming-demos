"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { resolveToolSource, useConfig, type UseConfigResult } from "./use-config"
import { useDemoEventListener, useDemoEvents } from "./use-demo-events"
import { useMode, type Mode } from "./use-mode"
import { usePricing } from "./use-pricing"
import type { Timeline } from "@/components/panels/agent"
import type { JobProgress, ToolActivity } from "@/lib/claude-sdk/job-store"
import type {
  AttributionRow,
  Counters,
  ObservabilityPulse,
  TapeRow,
} from "@/lib/observability-types"
import { readUiMessageChunks } from "@/lib/ui-stream"

const ROY_HIST_LEN = 32
const MAX_TAPE_BUFFER = 12
const DONE3 = { planner: "done", specialist: "done", critic: "done" } as const
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface AgentTool {
  icon: string
  name: string
  summary: string
  args: string
  result: string
}

export type ChatMessage =
  | { uid: number; role: "user"; text: string }
  | {
      uid: number
      role: "agent"
      sender: string
      tools: AgentTool[]
      text: string
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
      { key: event.attributionKey, label: event.attributionLabel, eur: round4(event.royaltyEur) },
    ]
  }
  const next = [...rows]
  next[idx] = { ...next[idx], eur: round4(next[idx].eur + event.royaltyEur) }
  return next
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

  useDemoEventListener("tool-call", (event) => {
    const ts = new Date(event.timestamp)
    const row: TapeRow = {
      uid: event.timestamp,
      t: `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`,
      tool: formatTapeTool(event.toolName, event.args),
      meta: formatTapeMeta(event.tokensEstimate, event.royaltyEur, event.attributionLabel),
      fresh: true,
    }
    window.setTimeout(() => {
      setFeed((prev) =>
        [row, ...prev.map((r) => ({ ...r, fresh: false }))].slice(0, MAX_TAPE_BUFFER),
      )
    }, 100)
    window.setTimeout(() => {
      const hits = event.kind === "dataset" ? Math.max(1, event.datasetIds.length) : 1
      setCounters((c) => ({
        apiCalls: c.apiCalls + 1,
        dataPoints: c.dataPoints + hits,
        royalties: round4(c.royalties + event.royaltyEur),
      }))
    }, 200)
    window.setTimeout(() => {
      setAttribution((rows) => upsertAttribution(rows, event))
      setPulse((p) => ({
        ...p,
        attr: { key: event.attributionKey, n: p.attr ? p.attr.n + 1 : 1, amount: event.royaltyEur },
      }))
    }, 400)
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
        { uid, role: "agent", sender, tools: [], text: "", streaming: true, fresh: false },
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
    (toolName: string, args: Record<string, unknown> | null, agentUid: number) => {
      const sources = sourcesRef.current
      const computeRoyalty = computeRoyaltyRef.current
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
      const { royaltyEur, datasetIds } = computeRoyalty(toolName, args, kind)
      events.emit({
        type: "tool-call",
        toolName,
        args,
        kind,
        datasetIds,
        connectorId,
        attributionKey,
        attributionLabel,
        royaltyEur,
        tokensEstimate: 0,
        timestamp: ts,
      })
      const summary = (() => {
        if (kind === "dataset" && datasetIds.length > 0) {
          return `${datasetIds.length} dataset(s) · ${attributionLabel}`
        }
        return attributionLabel
      })()
      setAgentMessage(agentUid, (m) => ({
        ...m,
        fresh: true,
        tools: [
          ...m.tools,
          {
            icon: kind === "dataset" ? "search" : "plug",
            name: toolName,
            summary,
            args: JSON.stringify(args ?? {}, null, 2),
            result: "(live)",
          },
        ],
      }))
    },
    [events, setAgentMessage],
  )

  const runModeA = useCallback(
    async (query: string, agentUid: number) => {
      const res = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "agentic",
          messages: [{ role: "user", content: query }],
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`Mode A failed: ${res.status} ${res.statusText}`)
      }
      let accText = ""
      let sawFirstTool = false
      for await (const chunk of readUiMessageChunks(res.body)) {
        if (cancelRef.current) break
        const type = chunk.type as string | undefined
        switch (type) {
          case "text-delta": {
            const delta = String(chunk.delta ?? "")
            if (!delta) break
            accText += delta
            setAgentMessage(agentUid, (m) => ({ ...m, text: accText, streaming: true, faded: false }))
            break
          }
          case "data-toolCall": {
            const data = chunk.data as { id?: string; name?: string; args?: unknown } | undefined
            if (!data?.name) break
            const argsObj =
              data.args && typeof data.args === "object"
                ? (data.args as Record<string, unknown>)
                : null
            dispatchToolCall(data.name, argsObj, agentUid)
            if (!sawFirstTool) {
              sawFirstTool = true
              setTimeline({ planner: "done", specialist: "exec", critic: "pending" })
            }
            break
          }
          case "data-subagent":
            if (!sawFirstTool) {
              setTimeline({ planner: "done", specialist: "exec", critic: "pending" })
            }
            break
          case "data-subagent-end":
            break
          case "finish":
            setAgentMessage(agentUid, (m) => ({ ...m, streaming: false }))
            setTimeline({ ...DONE3 })
            break
          case "error":
            throw new Error(String(chunk.errorText ?? "stream error"))
          default:
            break
        }
      }
      setAgentMessage(agentUid, (m) => ({ ...m, streaming: false }))
    },
    [dispatchToolCall, setAgentMessage],
  )

  const runModeB = useCallback(
    async (query: string, agentUid: number) => {
      const startRes = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "data",
          messages: [{ role: "user", content: query }],
        }),
      })
      if (!startRes.ok) throw new Error(`Mode B start failed: ${startRes.status}`)
      const { jobId } = (await startRes.json()) as { jobId: string }
      let seenActivity = 0
      let seenMessages = 0
      let accText = ""
      while (true) {
        if (cancelRef.current) {
          await fetch(`/api/demo/stop/${jobId}`, { method: "POST" }).catch(() => {})
          break
        }
        await sleep(1500)
        const sres = await fetch(`/api/demo/status/${jobId}`)
        if (!sres.ok) {
          if (sres.status === 404) throw new Error("Mode B job vanished")
          continue
        }
        const job = (await sres.json()) as JobProgress
        while (seenActivity < job.toolActivity.length) {
          const activity = job.toolActivity[seenActivity++] as ToolActivity
          dispatchToolCall(activity.toolName, activity.input ?? null, agentUid)
        }
        while (seenMessages < job.messages.length) {
          const msg = job.messages[seenMessages++]
          if ((msg.type === "assistant-text" || msg.type === "complete") && msg.content) {
            accText = msg.type === "complete" ? msg.content : accText + msg.content
            setAgentMessage(agentUid, (m) => ({
              ...m,
              text: accText,
              streaming: msg.type !== "complete",
              faded: false,
            }))
          }
          if (msg.type === "complete" && msg.usage) {
            const usage = msg.usage as { input_tokens?: number; output_tokens?: number }
            const inTok = Number(usage.input_tokens ?? 0)
            const outTok = Number(usage.output_tokens ?? 0)
            events.emit({
              type: "usage",
              inputTokens: Number.isFinite(inTok) ? inTok : null,
              outputTokens: Number.isFinite(outTok) ? outTok : null,
              totalTokens: inTok + outTok,
            })
          }
        }
        if (job.status === "complete" || job.status === "error") {
          setAgentMessage(agentUid, (m) => ({ ...m, streaming: false }))
          if (job.status === "error" && job.error) {
            console.error("[mode-b] job error:", job.error)
          }
          break
        }
      }
    },
    [dispatchToolCall, events, setAgentMessage],
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
        if (agentic) await runModeA(query, agentUid)
        else await runModeB(query, agentUid)
      } catch (err) {
        console.error("[demo] live turn failed:", err)
        const msg = err instanceof Error ? err.message : String(err)
        setAgentMessage(agentUid, (m) => ({
          ...m,
          streaming: false,
          text:
            m.text +
            (m.text ? "\n\n" : "") +
            `_Turn failed: ${msg}. Check .env and the platform's /agent/${process.env.NEXT_PUBLIC_DEMO_WORKFLOW_ID ?? "<id>"}/responses route._`,
        }))
      } finally {
        if (agentic) setTimeline({ ...DONE3 })
        runningRef.current = false
      }
    },
    [addAgentMessage, addUserMessage, mode, runModeA, runModeB, setAgentMessage],
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

  const dsClusterCount = config.view?.clusters.length ?? 0
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

export const MODEL = "Claude Opus 4.7"

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
