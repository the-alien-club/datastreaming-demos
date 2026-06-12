"use client"

import { useEffect, useState } from "react"
import type { ConfigView } from "@/hooks/use-config"
import { useDemoEventListener } from "@/hooks/use-demo-events"
import { Icon } from "../icons"
import { AuthBadge, InfoTip, Sparkline } from "../widgets"

const SPARK_LEN = 6

type ConnectorSparkline = { values: number[]; lastAt: string; pulseN: number }

function Cbx({ on }: { on: boolean }) {
  return (
    <span className={"cbx " + (on ? "on" : "")}>
      {on && <Icon name="check" size={11} strokeWidth={2.8} />}
    </span>
  )
}

function relativeTime(ms: number): string {
  if (ms < 1500) return "just now"
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

export function ExternalApis({
  view,
  isLoading,
  errorMessage,
  onToggle,
}: {
  view: ConfigView | null
  isLoading: boolean
  errorMessage: string | null
  onToggle: (connectorId: number) => void
}) {
  const [sparks, setSparks] = useState<Map<number, ConnectorSparkline>>(new Map())
  const [, setTick] = useState(0)

  useDemoEventListener("tool-call", (event) => {
    if (event.kind !== "api" || event.connectorId === null) return
    const connectorId = event.connectorId
    setSparks((prev) => {
      const next = new Map(prev)
      const existing = next.get(connectorId) ?? { values: new Array(SPARK_LEN).fill(0), lastAt: "", pulseN: 0 }
      const nextValues = [...existing.values.slice(1), 3 + Math.floor(Math.random() * 5)]
      next.set(connectorId, {
        values: nextValues,
        lastAt: new Date().toISOString(),
        pulseN: existing.pulseN + 1,
      })
      return next
    })
  })

  // 1Hz tick so the "12s ago" label updates without re-emitting events.
  useEffect(() => {
    if (typeof window === "undefined") return
    const id = window.setInterval(() => setTick((n) => (n + 1) % 1024), 1000)
    return () => window.clearInterval(id)
  }, [])

  const sel = view ? view.externalApis.filter((a) => a.checked).length : 0

  return (
    <section className="panel p-api">
      <header className="panel-head">
        <Icon name="plug" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">External APIs</span>
        <span className="spacer" />
        <span className="meta-chip">{sel} connected</span>
        <InfoTip text="Proxy any service into the agent's toolset. Click to connect or disconnect." />
      </header>
      <div className="panel-body">
        {isLoading && (
          <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neutral-500)" }}>
            Loading connectors…
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
            Could not load connectors: {errorMessage}
          </div>
        )}
        {!isLoading && !errorMessage && view && (
          <div className="api-list">
            {view.externalApis.length === 0 && (
              <div
                style={{
                  padding: 12,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--neutral-500)",
                }}
              >
                No connectors available for this organization.
              </div>
            )}
            {view.externalApis.map((a) => {
              const spark = sparks.get(a.connector_id)
              const off = !a.checked
              const idle = !spark || spark.values.every((v) => v === 0)
              const lastLabel = spark
                ? relativeTime(Date.now() - new Date(spark.lastAt).getTime())
                : "idle"
              const isPulse = spark ? spark.pulseN > 0 : false
              return (
                <div
                  key={a.connector_id + (isPulse ? `#${spark?.pulseN}` : "")}
                  className={
                    "api-row" +
                    (off ? " off" : "") +
                    (idle && !off ? " idle" : "") +
                    (isPulse ? " pulsing" : "")
                  }
                  onClick={() => onToggle(a.connector_id)}
                >
                  <Cbx on={a.checked} />
                  <span className="api-ic">
                    <Icon name="plug" size={15} />
                  </span>
                  <div className="api-main">
                    <span className="api-name">{a.name}</span>
                    <div className="api-sub">
                      <AuthBadge auth={authLabel(a)} />
                      <span className="api-last">{lastLabel}</span>
                    </div>
                  </div>
                  <div className="api-right">
                    <span className="api-expand">View {a.endpointCount} endpoints</span>
                    {idle || off ? (
                      <div className="sparkline">
                        {new Array(SPARK_LEN).fill(0).map((_, i) => (
                          <div key={i} className="bar empty" />
                        ))}
                      </div>
                    ) : (
                      <Sparkline values={spark!.values} fresh={isPulse} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Synthesise a short auth label from what the catalog gives us. The platform
 * doesn't expose the auth scheme in available-sources today; show a generic
 * "Proxied" badge so the visual cue still lands. Slug-specific overrides
 * are kept for the well-known connectors users will recognise.
 */
function authLabel(a: { slug: string; description: string | null }): string {
  const slug = a.slug.toLowerCase()
  if (slug.includes("crossref") || slug.includes("orcid")) return "OAuth"
  if (slug.includes("crm") || slug.includes("intranet")) return "mTLS"
  if (slug.includes("scholar") || slug.includes("s2")) return "API key"
  return "Proxied"
}
