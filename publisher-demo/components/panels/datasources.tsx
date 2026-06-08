"use client"

import { type ReactNode, useState } from "react"
import type { Datasource } from "@/lib/seed-data"
import { Icon } from "../icons"
import { InfoTip, StatusDot } from "../widgets"

export type DsPulse = { ds: { id: string; n: number } | null }

function Cbx({ state }: { state: "on" | "off" | "mixed" }) {
  return (
    <span className={`cbx ${state === "on" ? "on" : state === "mixed" ? "mixed" : ""}`}>
      {state === "on" && <Icon name="check" size={11} strokeWidth={2.8} />}
    </span>
  )
}

function Row({
  id,
  selected,
  parent,
  child,
  isPulse,
  pulseN,
  onClick,
  children,
}: {
  id: string
  selected?: boolean
  parent?: boolean
  child?: boolean
  isPulse: boolean
  pulseN: number
  onClick: () => void
  children: ReactNode
}) {
  const [rip, setRip] = useState(0)
  return (
    <div
      key={id + (isPulse ? `#${pulseN}` : "")}
      className={
        "ds-row" +
        (child ? " child" : "") +
        (parent ? " parent" : "") +
        (selected ? " selected" : "") +
        (isPulse ? " pulsing" : "")
      }
      onClick={() => {
        setRip((n) => n + 1)
        onClick()
      }}
    >
      {rip > 0 && <span className="ripple" key={rip} />}
      {children}
    </div>
  )
}

export function Datasources({
  sources,
  pulse,
  onToggle,
  onExpand,
}: {
  sources: Datasource[]
  pulse: DsPulse
  onToggle: (id: string) => void
  onExpand: (id: string) => void
}) {
  let sel = 0
  sources.forEach((s) => {
    if (s.leaf) {
      if (s.checked) sel++
    } else {
      s.children?.forEach((c) => {
        if (c.checked) sel++
      })
    }
  })

  return (
    <section className="panel p-ds">
      <header className="panel-head">
        <Icon name="database" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Datasources</span>
        <span className="spacer" />
        <span className="meta-chip">{sel} selected</span>
        <InfoTip text="Toggle what the agent is allowed to retrieve from." />
      </header>
      <div className="panel-body">
        <div className="ds-list">
          {sources.map((s) => {
            const isPulseRow = pulse.ds?.id === s.id
            const pulseN = pulse.ds?.n ?? 0
            if (s.leaf) {
              return (
                <Row
                  key={s.id}
                  id={s.id}
                  selected={s.checked}
                  parent
                  isPulse={isPulseRow}
                  pulseN={pulseN}
                  onClick={() => onToggle(s.id)}
                >
                  <span className="ds-chev-spacer" />
                  <Cbx state={s.checked ? "on" : "off"} />
                  <span className="ds-name">{s.name}</span>
                  {s.priv && (
                    <span className="priv-tag" title={s.priv}>
                      Private
                    </span>
                  )}
                  {s.status && <StatusDot status={s.status} />}
                </Row>
              )
            }
            const cc = s.children?.filter((c) => c.checked).length ?? 0
            const total = s.children?.length ?? 0
            const pstate: "on" | "off" | "mixed" = cc === 0 ? "off" : cc === total ? "on" : "mixed"
            return (
              <div key={s.id}>
                <Row
                  id={s.id}
                  selected={cc > 0}
                  parent
                  isPulse={isPulseRow}
                  pulseN={pulseN}
                  onClick={() => onToggle(s.id)}
                >
                  <button
                    type="button"
                    className="ds-chev"
                    onClick={(e) => {
                      e.stopPropagation()
                      onExpand(s.id)
                    }}
                    aria-label={s.open ? "Collapse" : "Expand"}
                  >
                    <Icon name={s.open ? "chevD" : "chevR"} size={13} />
                  </button>
                  <Cbx state={pstate} />
                  <span className="ds-name">{s.name}</span>
                  <span className="ds-count">{s.datasets} datasets</span>
                </Row>
                {s.open &&
                  s.children?.map((c) => {
                    const cIsPulse = pulse.ds?.id === c.id
                    return (
                      <Row
                        key={c.id}
                        id={c.id}
                        selected={c.checked}
                        child
                        isPulse={cIsPulse}
                        pulseN={pulse.ds?.n ?? 0}
                        onClick={() => onToggle(c.id)}
                      >
                        <Cbx state={c.checked ? "on" : "off"} />
                        <span className="ds-name">{c.name}</span>
                        <span className="ds-docs">{c.docs} docs</span>
                        <StatusDot status={c.status} />
                      </Row>
                    )
                  })}
                {s.open && s.more && <div className="ds-more">{s.more}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
