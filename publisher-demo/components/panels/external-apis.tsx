"use client"

import type { ApiConnector } from "@/lib/seed-data"
import { Icon } from "../icons"
import { AuthBadge, InfoTip, Sparkline } from "../widgets"

export type ApiPulse = { api: { id: string; n: number } | null }

function Cbx({ on }: { on: boolean }) {
  return (
    <span className={`cbx ${on ? "on" : ""}`}>
      {on && <Icon name="check" size={11} strokeWidth={2.8} />}
    </span>
  )
}

export function ExternalApis({
  apis,
  pulse,
  onToggle,
}: {
  apis: ApiConnector[]
  pulse: ApiPulse
  onToggle: (id: string) => void
}) {
  const sel = apis.filter((a) => a.checked).length
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
        <div className="api-list">
          {apis.map((a) => {
            const isPulse = pulse.api?.id === a.id
            const off = !a.checked
            return (
              <div
                key={a.id + (isPulse ? `#${pulse.api?.n}` : "")}
                className={
                  "api-row" +
                  (off ? " off" : "") +
                  (a.idle && !off ? " idle" : "") +
                  (isPulse ? " pulsing" : "")
                }
                onClick={() => onToggle(a.id)}
              >
                <Cbx on={a.checked} />
                <span className="api-ic">
                  <Icon name="plug" size={15} />
                </span>
                <div className="api-main">
                  <span className="api-name">{a.name}</span>
                  <div className="api-sub">
                    <AuthBadge auth={a.auth} />
                    <span className="api-last">{a.last}</span>
                  </div>
                </div>
                <div className="api-right">
                  <span className="api-expand">View {a.endpoints} endpoints</span>
                  {a.idle || off ? (
                    <div className="sparkline">
                      {[0, 0, 0, 0, 0, 0].map((_, i) => (
                        <div key={i} className="bar empty" />
                      ))}
                    </div>
                  ) : (
                    <Sparkline values={a.spark} fresh={isPulse} />
                  )}
                </div>
              </div>
            )
          })}
          <div className="api-ghost">
            <span className="lead">
              <Icon name="plus" size={14} />
              Connect an API
            </span>
            <span className="sub">REST · GraphQL · gRPC</span>
          </div>
        </div>
      </div>
    </section>
  )
}
