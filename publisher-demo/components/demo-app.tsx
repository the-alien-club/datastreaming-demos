"use client"

import { useMemo, useRef, useState } from "react"
import type { JobProgress, ToolActivity } from "@/lib/claude-sdk/job-store"
import { usePricing } from "@/lib/pricing"
import {
  type AgentMessage,
  APIS,
  ATTRIBUTION,
  buildRun,
  CONFIG_JSON,
  DATASOURCES,
  type Datasource,
  DONE3,
  EMPTY_STATE,
  FEED,
  MESSAGES,
  type Message,
  MODEL,
  type ScriptedTool,
  SUGGESTIONS,
} from "@/lib/seed-data"
import { resolveLiveTool } from "@/lib/tool-resolver"
import { readUiMessageChunks } from "@/lib/ui-stream"
import { Icon } from "./icons"
import { AccessMode, type Mode } from "./panels/access-mode"
import { Agent, type Timeline } from "./panels/agent"
import { Datasources } from "./panels/datasources"
import { ExternalApis } from "./panels/external-apis"
import { Observability } from "./panels/observability"
import { DsButton } from "./widgets"

type Pulse = {
  ds: { id: string; n: number } | null
  api: { id: string; n: number } | null
  attr: { key: string; n: number } | null
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function ConfigChip({
  dsCount,
  apiCount,
  dirty,
  pulseKey,
  onSave,
}: {
  dsCount: number
  apiCount: number
  dirty: boolean
  pulseKey: number
  onSave: () => void
}) {
  return (
    <div
      className={`cfg-chip${dirty ? " dirty" : ""}`}
      key={`cfg${pulseKey}`}
      data-pulse={pulseKey}
    >
      <span className="cfg-ic">
        <Icon name="gear" size={15} />
      </span>
      <div className="cfg-text">
        <span className="cfg-title">
          MCP Configuration · <code>cfg_publisher_demo</code>
        </span>
        <span className="cfg-sub">
          {dsCount} datasources · {apiCount} APIs · used by both modes
        </span>
      </div>
      {dirty && (
        <button type="button" className="cfg-save" onClick={onSave}>
          <Icon name="check" size={13} strokeWidth={2.4} />
          Save
        </button>
      )}
    </div>
  )
}

export function DemoApp() {
  const uidRef = useRef(1000)
  const nid = () => {
    uidRef.current += 1
    return uidRef.current
  }
  const init = useMemo(() => makeInitialState(), [])
  const pricing = usePricing()

  const [datasources, setDatasources] = useState<Datasource[]>(init.datasources)
  const [apis, setApis] = useState(init.apis)
  const [attribution, setAttribution] = useState(init.attribution)
  const [mode, setMode] = useState<Mode>("dataflow")
  const [counters, setCounters] = useState(init.counters)
  const [feed, setFeed] = useState(init.feed)
  const [messages, setMessages] = useState<Message[]>(init.messages)
  const [timeline, setTimeline] = useState<Timeline>({ ...DONE3 })
  const [pulse, setPulse] = useState<Pulse>({ ds: null, api: null, attr: null })
  const [input, setInput] = useState("")
  const [pressed, setPressed] = useState<number | null>(null)
  const [railActive, setRailActive] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [cfgPulse, setCfgPulse] = useState(0)
  const [feedFlash, setFeedFlash] = useState(0)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  const runningRef = useRef(false)
  const cancelRef = useRef(false)
  const applyingUntil = useRef(0)
  // Pricing is sampled into a ref so async event dispatchers don't need to
  // re-render when pricing arrives mid-turn.
  const pricingRef = useRef(pricing)
  pricingRef.current = pricing

  function addMsg(m: Omit<Message, "uid">) {
    const uid = nid()
    setMessages((ms) => [...ms, { ...(m as Message), uid }])
    return uid
  }

  function fireEvent(tool: ScriptedTool, agentUid: number) {
    setMessages((ms) =>
      ms.map((m) => {
        if (m.uid === agentUid && m.role === "agent") {
          return {
            ...m,
            fresh: true,
            tools: [...(m.tools || []), tool],
          } as AgentMessage
        }
        return m
      }),
    )
    setTimeout(() => {
      setFeed((f) =>
        [
          { uid: nid(), t: tool.t, tool: tool.feedTool, meta: tool.feedMeta, fresh: true },
          ...f.map((r) => ({ ...r, fresh: false })),
        ].slice(0, 8),
      )
    }, 100)
    setTimeout(() => {
      setCounters((c) => ({
        ...c,
        apiCalls: c.apiCalls + 1,
        royalties: +(c.royalties + tool.royalty).toFixed(4),
      }))
    }, 200)
    setTimeout(() => {
      if (tool.type === "dataset") {
        setPulse((p) => ({ ...p, ds: { id: tool.dsRow!, n: nid() } }))
      } else {
        setApis((arr) =>
          arr.map((a) =>
            a.id === tool.apiRow
              ? {
                  ...a,
                  last: "just now",
                  spark: [...a.spark.slice(1), 3 + Math.floor(Math.random() * 5)],
                }
              : a,
          ),
        )
        setPulse((p) => ({ ...p, api: { id: tool.apiRow!, n: nid() } }))
      }
    }, 300)
    setTimeout(() => {
      setAttribution((arr) =>
        arr.map((s) =>
          s.key === tool.sourceKey
            ? { ...s, weight: s.weight + (tool.type === "dataset" ? 9 : 4) }
            : s,
        ),
      )
      setPulse((p) => ({ ...p, attr: { key: tool.sourceKey, n: nid() } }))
    }, 400)
  }

  function setAgentText(agentUid: number, text: string, streaming: boolean) {
    setMessages((ms) =>
      ms.map((m) =>
        m.uid === agentUid && m.role === "agent"
          ? ({ ...m, text, streaming, faded: false } as AgentMessage)
          : m,
      ),
    )
  }

  async function runAgent(query: string) {
    if (runningRef.current) return
    runningRef.current = true
    cancelRef.current = false

    const agentic = mode === "agentic"
    setInput("")
    addMsg({ role: "user", text: query })
    const agentUid = addMsg({
      role: "agent",
      sender: agentic ? "DeepAgent" : "Claude",
      tools: [],
      text: "",
      fresh: false,
    } as AgentMessage)

    if (agentic) {
      setRailActive(true)
      setTimeline({ planner: "exec", specialist: "pending", critic: "pending" })
    }

    // Surface the "applying new config" inline notice if a recent save is
    // still propagating.
    const applying = Date.now() < applyingUntil.current
    if (applying) {
      const uid = nid()
      setMessages((ms) => [
        ...ms,
        { role: "scope", uid, text: "New MCP Configuration · applying…" } as Message,
      ])
      setTimeout(() => setMessages((ms) => ms.filter((m) => m.uid !== uid)), 1200)
    }

    try {
      if (agentic) {
        await runModeA(query, agentUid)
      } else {
        await runModeB(query, agentUid)
      }
    } catch (err) {
      console.error("[demo] live turn failed — falling back to scripted runner:", err)
      // Backend unreachable or env not configured. Fall back to the design's
      // scripted run so the demo always shows something, even offline.
      await runScripted(query, agentUid, agentic)
    } finally {
      if (agentic) setTimeline({ ...DONE3 })
      runningRef.current = false
    }
  }

  async function runModeA(query: string, agentUid: number) {
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
    let sawFirstText = false

    for await (const chunk of readUiMessageChunks(res.body)) {
      if (cancelRef.current) break
      const type = chunk.type as string | undefined
      switch (type) {
        case "text-delta": {
          const delta = String(chunk.delta ?? "")
          if (!delta) break
          accText += delta
          setAgentText(agentUid, accText, true)
          if (!sawFirstText && sawFirstTool) {
            sawFirstText = true
            setTimeline({ planner: "done", specialist: "done", critic: "exec" })
          }
          break
        }
        case "data-toolCall": {
          const data = chunk.data as { id?: string; name?: string; args?: unknown } | undefined
          if (!data?.name) break
          const tool = resolveLiveTool(data.name, data.args, pricingRef.current)
          fireEvent(tool, agentUid)
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
          // Closing back to MAIN; rail will resolve on finish.
          break
        case "finish":
          setAgentText(agentUid, accText, false)
          setTimeline({ ...DONE3 })
          break
        case "error": {
          const errorText = String(chunk.errorText ?? "stream error")
          throw new Error(errorText)
        }
        default:
          break
      }
    }

    setAgentText(agentUid, accText, false)
  }

  async function runModeB(query: string, agentUid: number) {
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
    let totalTokens = 0

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
        const tool = resolveLiveTool(activity.toolName, activity.input ?? {}, pricingRef.current)
        fireEvent(tool, agentUid)
        totalTokens += tool.tokens
      }

      while (seenMessages < job.messages.length) {
        const msg = job.messages[seenMessages++]
        if ((msg.type === "assistant-text" || msg.type === "complete") && msg.content) {
          accText = msg.type === "complete" ? msg.content : accText + msg.content
          setAgentText(agentUid, accText, msg.type !== "complete")
        }
      }

      if (job.status === "complete" || job.status === "error") {
        setAgentText(agentUid, accText, false)
        if (totalTokens > 0) {
          setCounters((c) => ({ ...c, tokens: c.tokens + totalTokens }))
        }
        if (job.status === "error" && job.error) {
          console.error("[mode-b] job error:", job.error)
        }
        break
      }
    }
  }

  // Scripted fallback — drives the same fireEvent ripple from the design's
  // deterministic buildRun() so the demo works offline / without env config.
  async function runScripted(query: string, agentUid: number, agentic: boolean) {
    const run = buildRun(query)

    if (agentic) {
      setTimeline({ planner: "exec", specialist: "pending", critic: "pending" })
      await sleep(680)
      setTimeline({ planner: "done", specialist: "exec", critic: "pending" })
    } else {
      await sleep(440)
    }

    let totalTokens = 0
    for (const tool of run.tools) {
      if (cancelRef.current) return
      fireEvent(tool, agentUid)
      totalTokens += tool.tokens
      await sleep(840)
    }

    if (agentic) {
      setTimeline({ planner: "done", specialist: "done", critic: "exec" })
      setMessages((ms) =>
        ms.map((m) =>
          m.uid === agentUid && m.role === "agent"
            ? ({ ...m, chain: run.chain } as AgentMessage)
            : m,
        ),
      )
      await sleep(440)
    } else {
      await sleep(280)
    }

    const words = run.answer.split(" ")
    let acc = ""
    for (let i = 0; i < words.length; i++) {
      if (cancelRef.current) return
      acc += (i ? " " : "") + words[i]
      setAgentText(agentUid, acc, true)
      await sleep(24)
    }
    setAgentText(agentUid, acc, false)
    setCounters((c) => ({ ...c, tokens: c.tokens + totalTokens }))
  }

  function toggleDataset(id: string) {
    setDatasources((srcs) =>
      srcs.map((s) => {
        if (s.leaf && s.id === id) return { ...s, checked: !s.checked }
        if (!s.leaf && s.id === id && s.children) {
          const allOn = s.children.every((c) => c.checked)
          return { ...s, children: s.children.map((c) => ({ ...c, checked: !allOn })) }
        }
        if (!s.leaf && s.children) {
          return {
            ...s,
            children: s.children.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)),
          }
        }
        return s
      }),
    )
    setDirty(true)
  }

  function toggleApi(id: string) {
    setApis((arr) => arr.map((a) => (a.id === id ? { ...a, checked: !a.checked } : a)))
    setDirty(true)
  }

  function expandSource(id: string) {
    setDatasources((srcs) => srcs.map((s) => (s.id === id ? { ...s, open: !s.open } : s)))
  }

  function saveConfig() {
    setDirty(false)
    setCfgPulse(nid())
    setFeedFlash(nid())
    applyingUntil.current = Date.now() + 8000

    // Best-effort PUT — if the backend rejects we still optimistically pulse
    // because the demo's value is the choreography, not the persistence.
    const payload = buildConfigPayload(datasources, apis)
    fetch("/api/demo/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((err) => console.error("[demo] config PUT failed:", err))

    const uid = nid()
    setMessages((ms) => [
      ...ms,
      { role: "scope", uid, text: "Configuration updated · applying…" } as Message,
    ])
    setTimeout(() => setMessages((ms) => ms.filter((m) => m.uid !== uid)), 3400)
  }

  function onChip(text: string, idx: number) {
    setPressed(idx)
    setInput(text)
    setTimeout(() => setPressed(null), 240)
  }

  function confirmSwitch() {
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
    setPulse({ ds: null, api: null, attr: null })
  }

  function reset() {
    cancelRef.current = true
    runningRef.current = false
    const s = makeInitialState()
    setDatasources(s.datasources)
    setApis(s.apis)
    setAttribution(s.attribution)
    setMode("dataflow")
    setCounters(s.counters)
    setFeed(s.feed)
    setMessages(s.messages)
    setTimeline({ ...DONE3 })
    setPulse({ ds: null, api: null, attr: null })
    setInput("")
    setPressed(null)
    setRailActive(false)
    setDirty(false)
    setPendingMode(null)
    applyingUntil.current = 0
  }

  const selectedApiCount = apis.filter((a) => a.checked).length

  return (
    <div className="app">
      <div className="titlebar">
        <img className="logo" src="/assets/logo-w.svg" alt="Alien" />
        <span className="tb-pill">
          <span className="pulse-dot" />
          Live demo
        </span>
        <span className="tb-spacer" />
        <DsButton variant="ghost" size="sm" onClick={reset}>
          <Icon name="reset" size={14} />
          Reset
        </DsButton>
      </div>

      <div className="substrip">
        <h1>
          <span className="muted">Your data. Your APIs.</span>{" "}
          <span className="accent">Agent-ready.</span>{" "}
          <span className="muted">Royalty-bearing.</span>
        </h1>
      </div>

      <div className="grid">
        <div className="left-col">
          <ConfigChip
            dsCount={datasources.length}
            apiCount={selectedApiCount}
            dirty={dirty}
            pulseKey={cfgPulse}
            onSave={saveConfig}
          />
          <Datasources
            sources={datasources}
            pulse={{ ds: pulse.ds }}
            onToggle={toggleDataset}
            onExpand={expandSource}
          />
          <ExternalApis apis={apis} pulse={{ api: pulse.api }} onToggle={toggleApi} />
        </div>
        <AccessMode mode={mode} onRequestSwitch={setPendingMode} />
        <Observability
          counters={counters}
          feed={feed}
          attribution={attribution}
          pulse={{ attr: pulse.attr }}
          flash={feedFlash}
        />
        <Agent
          mode={mode}
          model={MODEL}
          messages={messages}
          timeline={timeline}
          railActive={railActive}
          input={input}
          pressed={pressed}
          suggestions={SUGGESTIONS[mode]}
          emptyState={EMPTY_STATE[mode]}
          configJson={CONFIG_JSON}
          onChip={onChip}
          onInput={setInput}
          onSend={() => {
            if (input.trim()) runAgent(input.trim())
          }}
        />
      </div>

      {pendingMode && (
        <div className="modal-overlay" onClick={() => setPendingMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Switch to {pendingMode === "agentic" ? "Agentic flow" : "Data flow"}?</h3>
            <p>
              Your current conversation will end. You'll start a fresh chat with the same data and
              tools, but the agent's memory of this session won't carry over.
            </p>
            <div className="modal-btns">
              <DsButton variant="ghost" size="sm" onClick={() => setPendingMode(null)}>
                Cancel
              </DsButton>
              <DsButton variant="primary" size="sm" onClick={confirmSwitch}>
                Switch and start new chat
              </DsButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function makeInitialState() {
  let uid = 1
  return {
    datasources: clone(DATASOURCES),
    apis: clone(APIS),
    attribution: clone(ATTRIBUTION),
    counters: { apiCalls: 247, tokens: 184000, royalties: 3.412 },
    feed: FEED.map((r) => ({ ...r, uid: uid++, fresh: false })),
    messages: MESSAGES.map((m) => ({ ...m, uid: uid++ }) as Message),
  }
}

/**
 * Translate the local datasources/APIs UI state into the wire shape the
 * backend's PUT /mcp-configurations/:slug expects. Each datasource becomes a
 * cluster with the checked children as `dataset_ids` (treated as numeric IDs
 * for now via name hashing — when real numeric IDs arrive from GET /config we
 * can swap to those). External APIs become `external_apis[].connector_id`.
 *
 * The backend treats unknown fields gracefully, so this payload is forward
 * compatible with the real schema even if some keys (e.g. dataset_ids as
 * numbers) need adjustment after live wiring.
 */
function buildConfigPayload(sources: Datasource[], apis: { id: string; checked: boolean }[]) {
  const clusters = sources.map((s) => {
    if (s.leaf) {
      return {
        cluster_slug: s.id,
        dataset_slugs: s.checked ? [s.id] : [],
      }
    }
    return {
      cluster_slug: s.id,
      dataset_slugs: (s.children ?? []).filter((c) => c.checked).map((c) => c.id),
    }
  })
  const external_apis = apis.filter((a) => a.checked).map((a) => ({ connector_slug: a.id }))
  return { config: { clusters, external_apis } }
}
