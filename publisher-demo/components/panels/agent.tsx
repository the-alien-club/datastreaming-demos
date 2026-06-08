"use client"

import { useEffect, useRef, useState } from "react"
import type { Message, ToolEntry } from "@/lib/seed-data"
import { Icon, type IconName } from "../icons"
import type { Mode } from "./access-mode"

const NODES = [
  { k: "planner", ic: "cpu" as IconName, lab: "Planner" },
  { k: "specialist", ic: "search" as IconName, lab: "Specialist" },
  { k: "critic", ic: "check" as IconName, lab: "Critic" },
] as const

export type TimelineState = "pending" | "exec" | "done"
export type Timeline = Record<"planner" | "specialist" | "critic", TimelineState>

function ToolCard({ tool, fresh }: { tool: ToolEntry; fresh?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`tool-card${fresh ? " enter" : ""}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`tool-chev${open ? " open" : ""}`}>
          <Icon name="chevR" size={13} />
        </span>
        <span className="tool-ic">
          <Icon name={tool.icon} size={14} />
        </span>
        <span className="tool-nm">{tool.name}</span>
        <span className="tool-sum">{tool.summary}</span>
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-block">
            <div className="k">Arguments</div>
            <pre>{tool.args}</pre>
          </div>
          <div className="tool-block">
            <div className="k">Result preview</div>
            <pre>{tool.result}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ChainOfThought({ chain }: { chain: { who: string; text: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="chain-card">
      <button
        type="button"
        className="chain-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`tool-chev${open ? " open" : ""}`}>
          <Icon name="chevR" size={13} />
        </span>
        <span className="tool-ic">
          <Icon name="network" size={13} />
        </span>
        <span className="chain-nm">Chain of thought</span>
        <span className="tool-sum">{chain.length} subagent steps</span>
      </button>
      {open && (
        <div className="chain-body">
          {chain.map((c, i) => (
            <div className="chain-step" key={i}>
              <span className="chain-who">{c.who}</span>
              <span className="chain-text">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentMessage({ m }: { m: Message }) {
  if (m.role === "scope") {
    return (
      <div className="scope-notice">
        <span className="pulse-dot" />
        {m.text}
      </div>
    )
  }
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble-user">{m.text}</div>
      </div>
    )
  }
  return (
    <div className="msg agent">
      <div className="agent-sender">
        <span className="agent-ava">
          <img src="/assets/glyph-w.svg" alt="" />
        </span>
        <span className="nm">{m.sender || "Claude"}</span>
      </div>
      {m.chain && m.chain.length > 0 && <ChainOfThought chain={m.chain} />}
      {m.tools?.map((t, i) => (
        <ToolCard key={i} tool={t} fresh={m.fresh} />
      ))}
      {m.text && (
        <div className={`agent-text${m.faded ? " faded" : ""}`}>
          {m.text}
          {m.streaming && <span className="cursor" />}
        </div>
      )}
    </div>
  )
}

function CopyConfigButton({ json }: { json: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  function copy() {
    try {
      navigator.clipboard.writeText(json)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <span className="cfg-copy-wrap">
      <button
        type="button"
        className={`copy-config-chip${open ? " on" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="plug" size={12} />
        Copy Claude Desktop config
      </button>
      {open && (
        <div className="cfg-popover">
          <div className="cfg-pop-title">
            This same configuration powers the demo and any external agent.
          </div>
          <pre className="cfg-json">{json}</pre>
          <button type="button" className={`cfg-copy-btn${copied ? " done" : ""}`} onClick={copy}>
            <Icon name={copied ? "check" : "file"} size={13} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </span>
  )
}

export function Agent({
  mode,
  model,
  messages,
  timeline,
  railActive,
  input,
  pressed,
  suggestions,
  emptyState,
  configJson,
  onChip,
  onInput,
  onSend,
}: {
  mode: Mode
  model: string
  messages: Message[]
  timeline: Timeline
  railActive: boolean
  input: string
  pressed: number | null
  suggestions: string[]
  emptyState: string
  configJson: string
  onChip: (text: string, idx: number) => void
  onInput: (text: string) => void
  onSend: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // Scroll to bottom whenever the messages list changes (new turns, streaming
  // deltas, tool calls). Biome's "exhaustive deps" rule flags this — it is
  // intentional; we want to re-run the effect on every messages change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const showRail = mode === "agentic" && railActive

  return (
    <section className="panel p-agent agent">
      <header className="panel-head agent-head">
        <Icon name="spark" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Agent</span>
        <span className="spacer" />
        <span className="chip-row">
          {mode === "dataflow" && <CopyConfigButton json={configJson} />}
          <span className="mode-chip">
            <Icon name={mode === "agentic" ? "network" : "plug"} size={12} />
            {mode === "agentic" ? "Agentic flow" : "Data flow"}
          </span>
          <span className="model-chip">
            <Icon name="cpu" size={11} />
            {model}
          </span>
        </span>
      </header>

      <div className="agent-stage">
        <aside className={`rail${showRail ? "" : " hidden"}`}>
          {NODES.map((n, i) => {
            const st = timeline[n.k]
            return (
              <span key={n.k} style={{ display: "contents" }}>
                <div
                  className={`rail-node ${st === "exec" ? "exec" : st === "done" ? "done" : ""}`}
                >
                  <span className="rail-ic">
                    <Icon name={n.ic} size={14} />
                    <span className="lab">{n.lab}</span>
                  </span>
                </div>
                {i < NODES.length - 1 && (
                  <span className={`rail-link${st === "done" ? " done" : ""}`} />
                )}
              </span>
            )
          })}
        </aside>

        <div className="chat">
          <div className="chat-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <span className="agent-ava lg">
                  <img src="/assets/glyph-w.svg" alt="" />
                </span>
                <p>{emptyState}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <AgentMessage key={m.uid != null ? m.uid : `m${i}`} m={m} />
            ))}
          </div>

          <div className="composer">
            <div className="sugg-row">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`sugg${pressed === i ? " pressed" : ""}`}
                  onClick={() => onChip(s, i)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="composer-input">
              <input
                value={input}
                placeholder="Ask the agent…"
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) onSend()
                }}
              />
              <button
                type="button"
                className={`send-btn${input.trim() ? " active" : ""}`}
                disabled={!input.trim()}
                onClick={onSend}
                aria-label="Send"
              >
                <Icon name="send" size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
