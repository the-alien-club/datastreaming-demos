"use client"

import { useEffect, useRef, useState } from "react"
import type { ChatMessage, ToolEntry } from "@/lib/chat-messages"
import { Icon, type IconName } from "../icons"
import type { Mode } from "@/hooks/use-mode"

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

function AgentMessage({ m }: { m: ChatMessage }) {
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
  onChip,
  onInput,
  onSend,
}: {
  mode: Mode
  model: string
  messages: ChatMessage[]
  timeline: Timeline
  railActive: boolean
  input: string
  pressed: number | null
  suggestions: string[]
  emptyState: string
  onChip: (text: string, idx: number) => void
  onInput: (text: string) => void
  onSend: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // Scroll to bottom whenever the messages list changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Gently invite input if the composer sits untouched for >5.5s and is empty.
  const [invite, setInvite] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length intentional
  useEffect(() => {
    setInvite(false)
    if (input.trim()) return
    const id = window.setTimeout(() => setInvite(true), 5500)
    return () => window.clearTimeout(id)
  }, [input, messages.length])

  const showRail = mode === "agentic" && railActive

  return (
    <section className="panel p-agent agent">
      <header className="panel-head agent-head">
        <Icon name="spark" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Agent</span>
        <span className="spacer" />
        <span className="chip-row">
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
            <div className={`composer-input${invite ? " invite" : ""}`}>
              <input
                value={input}
                placeholder="Ask the agent…"
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) onSend()
                }}
              />
              {input.trim() && (
                <button
                  type="button"
                  className="send-btn active"
                  onClick={onSend}
                  aria-label="Send"
                >
                  <Icon name="send" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
