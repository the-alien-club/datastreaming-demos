"use client"

import { type ReactNode, useEffect, useState } from "react"
import type { ConfigView } from "@/hooks/use-config"
import { useDemoEventListener } from "@/hooks/use-demo-events"
import { Icon } from "../icons"
import { InfoTip } from "../widgets"

type Pulse = { clusterId: number | null; datasetId: number | null; n: number }

function Cbx({ state }: { state: "on" | "off" | "mixed" }) {
  return (
    <span className={"cbx " + (state === "on" ? "on" : state === "mixed" ? "mixed" : "")}>
      {state === "on" && <Icon name="check" size={11} strokeWidth={2.8} />}
    </span>
  )
}

function Row({
  rowKey,
  selected,
  parent,
  child,
  isPulse,
  onClick,
  anchor,
  children,
}: {
  rowKey: string
  selected?: boolean
  parent?: boolean
  child?: boolean
  isPulse: boolean
  onClick: () => void
  /** Optional `data-particle-anchor` value — used by the particle layer
   *  to flow tool-call particles from this specific row. */
  anchor?: string
  children: ReactNode
}) {
  const [rip, setRip] = useState(0)
  return (
    <div
      key={rowKey}
      data-particle-anchor={anchor}
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
  view,
  isLoading,
  errorMessage,
  onToggleDataset,
  onToggleCluster,
}: {
  view: ConfigView | null
  isLoading: boolean
  errorMessage: string | null
  onToggleDataset: (clusterId: number, datasetId: number) => void
  onToggleCluster: (clusterId: number) => void
}) {
  const [openClusters, setOpenClusters] = useState<Set<number>>(new Set())
  // Default-open the first cluster the first time data arrives so the demo
  // shows a populated tree on load.
  const [didInitOpen, setDidInitOpen] = useState(false)
  useEffect(() => {
    if (didInitOpen || !view || view.clusters.length === 0) return
    setOpenClusters(new Set([view.clusters[0].cluster_id]))
    setDidInitOpen(true)
  }, [view, didInitOpen])

  const [pulse, setPulse] = useState<Pulse>({ clusterId: null, datasetId: null, n: 0 })
  // Pulse on tool-result (settlement) — that's when we know which datasets
  // were actually touched. Use the first dataset id from the first attribution
  // row; render-time view tree maps it back to its cluster.
  useDemoEventListener("tool-result", (event) => {
    const firstId = event.attributionRows.find((r) => r.datasetIds.length > 0)?.datasetIds[0]
    if (firstId === undefined) return
    setPulse((p) => ({ clusterId: null, datasetId: firstId, n: p.n + 1 }))
  })

  const selectedCount = view
    ? view.clusters.reduce((acc, c) => acc + c.datasets.filter((d) => d.checked).length, 0)
    : 0

  const expand = (clusterId: number) => {
    setOpenClusters((prev) => {
      const next = new Set(prev)
      if (next.has(clusterId)) next.delete(clusterId)
      else next.add(clusterId)
      return next
    })
  }

  return (
    <section className="panel p-ds" data-particle-anchor="panel:datasources">
      <header className="panel-head">
        <Icon name="database" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Datasources</span>
        <span className="spacer" />
        <span className="meta-chip">{selectedCount} selected</span>
        <InfoTip text="Toggle what the agent is allowed to retrieve from." />
      </header>
      <div className="panel-body">
        {isLoading && (
          <div
            style={{
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--neutral-500)",
            }}
          >
            Loading sources…
          </div>
        )}
        {!isLoading && errorMessage && (
          <div
            style={{
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--destructive)",
            }}
          >
            Could not load datasources: {errorMessage}
          </div>
        )}
        {!isLoading && !errorMessage && view?.clusters.length === 0 && (
          <div
            style={{
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--neutral-500)",
            }}
          >
            No clusters available for this organization.
          </div>
        )}
        {!isLoading && !errorMessage && view && (
          <div className="ds-list">
            {view.clusters.map((c) => {
              const enabledCount = c.datasets.filter((d) => d.checked).length
              const totalCount = c.datasets.length
              const pstate: "on" | "off" | "mixed" =
                enabledCount === 0 ? "off" : enabledCount === totalCount ? "on" : "mixed"
              const isOpen = openClusters.has(c.cluster_id)
              return (
                <div key={c.cluster_id}>
                  <Row
                    rowKey={`cluster-${c.cluster_id}`}
                    selected={enabledCount > 0}
                    parent
                    isPulse={false}
                    onClick={() => onToggleCluster(c.cluster_id)}
                    anchor={`cluster:${c.cluster_id}`}
                  >
                    <button
                      type="button"
                      className="ds-chev"
                      onClick={(e) => {
                        e.stopPropagation()
                        expand(c.cluster_id)
                      }}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      <Icon name={isOpen ? "chevD" : "chevR"} size={13} />
                    </button>
                    <Cbx state={pstate} />
                    <span className="ds-name">{c.name}</span>
                    <span className="ds-count">{totalCount} datasets</span>
                  </Row>
                  {isOpen &&
                    c.datasets.map((d) => {
                      const isPulse = pulse.datasetId === d.id
                      return (
                        <Row
                          key={d.id}
                          rowKey={`dataset-${d.id}` + (isPulse ? `#${pulse.n}` : "")}
                          selected={d.checked}
                          child
                          isPulse={isPulse}
                          onClick={() => onToggleDataset(c.cluster_id, d.id)}
                          anchor={`dataset:${d.id}`}
                        >
                          <Cbx state={d.checked ? "on" : "off"} />
                          <span className="ds-name">{d.name}</span>
                          <span
                            className={`priv-tag ${d.is_public ? "priv-tag--public" : "priv-tag--private"}`}
                          >
                            {d.is_public ? "Public" : "Private"}
                          </span>
                          <span className="status-dot indexed" />
                        </Row>
                      )
                    })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
