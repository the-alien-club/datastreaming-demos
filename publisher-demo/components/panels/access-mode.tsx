"use client"

import { Icon, type IconName } from "../icons"
import { InfoTip } from "../widgets"

export type Mode = "dataflow" | "agentic"

function ModeCard({
  active,
  icon,
  name,
  sub,
  desc,
  flow,
  footer,
  footerArrow,
  onClick,
}: {
  active: boolean
  icon: IconName
  name: string
  sub: string
  desc: string
  flow: string[]
  footer: string
  footerArrow?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={"mode-card" + (active ? " active" : "")}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="mode-top">
        <span className="mode-ic">
          <Icon name={icon} size={17} />
        </span>
        <div className="mode-titles">
          <span className="mode-name">{name}</span>
          <span className="mode-sub">{sub}</span>
        </div>
        <span className="mode-active-tag">
          <span className="pulse-dot" />
          Active
        </span>
      </div>
      <p className="mode-desc">{desc}</p>
      <div className="flow">
        {flow.map((n, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {i > 0 && (
              <span className="arr">
                <Icon name="chevR" size={13} />
              </span>
            )}
            <span className="node">{n}</span>
          </span>
        ))}
      </div>
      <div className={"mode-foot" + (footerArrow ? " badge" : "")}>
        {footer}
        {footerArrow && <Icon name="chevR" size={12} />}
      </div>
    </button>
  )
}

export function AccessMode({
  mode,
  onRequestSwitch,
}: {
  mode: Mode
  onRequestSwitch: (target: Mode) => void
}) {
  return (
    <section className="panel p-mode">
      <header className="panel-head">
        <Icon name="sliders" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Access mode</span>
        <span className="spacer" />
        <InfoTip text="How agents use your MCP Configuration. Switch live — context does not transfer between runtimes." />
      </header>
      <div className="panel-body">
        <div className="mode-wrap">
          <ModeCard
            active={mode === "dataflow"}
            icon="plug"
            name="Data flow"
            sub="Claude SDK + Alien MCP"
            desc="Your data exposed as an MCP your customers plug into Claude Desktop, Cursor, or any agent host. We use the same SDK here as they will."
            flow={["Claude", "MCP tools"]}
            footer="Same URL works in Claude Desktop"
            footerArrow
            onClick={() => mode !== "dataflow" && onRequestSwitch("dataflow")}
          />
          <ModeCard
            active={mode === "agentic"}
            icon="network"
            name="Agentic flow"
            sub="Platform workflow"
            desc="Our orchestrated harness with planner, specialist subagents, and critique loop running on the same MCP tools."
            flow={["planner", "specialist", "critic"]}
            footer="Recommended for multi-step research tasks."
            onClick={() => mode !== "agentic" && onRequestSwitch("agentic")}
          />
        </div>
      </div>
    </section>
  )
}
