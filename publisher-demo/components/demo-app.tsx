"use client"

import { useMemo, useRef, useState } from "react"
import { Icon } from "./icons"
import { DsButton } from "./widgets"
import { Datasources } from "./panels/datasources"
import { ExternalApis } from "./panels/external-apis"
import { AccessMode, type Mode } from "./panels/access-mode"
import { Observability } from "./panels/observability"
import { Agent, type Timeline } from "./panels/agent"
import {
  APIS,
  ATTRIBUTION,
  CONFIG_JSON,
  DATASOURCES,
  DONE3,
  EMPTY_STATE,
  FEED,
  MESSAGES,
  MODEL,
  SUGGESTIONS,
  buildRun,
  type Datasource,
  type AgentMessage,
  type Message,
} from "@/lib/seed-data"

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
      className={"cfg-chip" + (dirty ? " dirty" : "")}
      key={"cfg" + pulseKey}
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
  const applyingUntil = useRef(0)

  function addMsg(m: Omit<Message, "uid">) {
    const uid = nid()
    setMessages((ms) => [...ms, { ...(m as Message), uid }])
    return uid
  }

  function fireEvent(tool: ReturnType<typeof buildRun>["tools"][number], agentUid: number) {
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

  async function runAgent(query: string) {
    if (runningRef.current) return
    runningRef.current = true
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
    const run = buildRun(query)
    const applying = Date.now() < applyingUntil.current

    if (agentic) {
      setRailActive(true)
      setTimeline({ planner: "exec", specialist: "pending", critic: "pending" })
      await sleep(680)
      setTimeline({ planner: "done", specialist: "exec", critic: "pending" })
    } else {
      await sleep(440)
    }

    if (applying) {
      const uid = nid()
      setMessages((ms) => [
        ...ms,
        { role: "scope", uid, text: "New MCP Configuration · applying…" } as Message,
      ])
      await sleep(950)
      setMessages((ms) => ms.filter((m) => m.uid !== uid))
    }

    let totalTokens = 0
    for (const tool of run.tools) {
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
      acc += (i ? " " : "") + words[i]
      setMessages((ms) =>
        ms.map((m) =>
          m.uid === agentUid && m.role === "agent"
            ? ({ ...m, text: acc, streaming: true, faded: false } as AgentMessage)
            : m,
        ),
      )
      await sleep(24)
    }
    setMessages((ms) =>
      ms.map((m) =>
        m.uid === agentUid && m.role === "agent"
          ? ({ ...m, streaming: false } as AgentMessage)
          : m,
      ),
    )

    setCounters((c) => ({ ...c, tokens: c.tokens + totalTokens }))

    if (agentic) setTimeline({ ...DONE3 })
    runningRef.current = false
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
          return { ...s, children: s.children.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)) }
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
        {/* biome-ignore lint/a11y/useAltText: branded logo */}
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
              Your current conversation will end. You'll start a fresh chat with the same data
              and tools, but the agent's memory of this session won't carry over.
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
