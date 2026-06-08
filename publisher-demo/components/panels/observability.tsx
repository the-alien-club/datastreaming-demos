"use client"

import { useEffect, useState } from "react"
import { Icon } from "../icons"
import { BumpNum, InfoTip, RollingText } from "../widgets"
import type { AttributionEntry, FeedEntry } from "@/lib/seed-data"

export type AttrPulse = { attr: { key: string; n: number } | null }

const fmtTokens = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n))

export function Observability({
  counters,
  feed,
  attribution,
  pulse,
  flash,
}: {
  counters: { apiCalls: number; tokens: number; royalties: number }
  feed: FeedEntry[]
  attribution: AttributionEntry[]
  pulse: AttrPulse
  flash: number
}) {
  const totalW = attribution.reduce((a, b) => a + b.weight, 0) || 1
  const sorted = [...attribution].sort((a, b) => b.weight - a.weight)
  const [banner, setBanner] = useState(false)
  useEffect(() => {
    if (flash) {
      setBanner(true)
      const id = setTimeout(() => setBanner(false), 2400)
      return () => clearTimeout(id)
    }
  }, [flash])

  return (
    <section className="panel p-feed">
      <header className="panel-head">
        <Icon name="activity" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Live access</span>
        <span className="spacer" />
        <span className="meta-chip live">
          <span className="pulse-dot" />
          Streaming
        </span>
        <InfoTip text="Every retrieval is logged and attributed." />
      </header>
      <div className="feed-counters">
        <div className="counter">
          <BumpNum display={counters.apiCalls.toLocaleString()} />
          <span className="lab">API calls</span>
        </div>
        <div className="counter">
          <RollingText text={fmtTokens(counters.tokens)} />
          <span className="lab">Tokens</span>
        </div>
        <div className="counter royalty">
          <RollingText text={"€" + counters.royalties.toFixed(3)} />
          <span className="lab">Royalties</span>
        </div>
      </div>

      <div className="feed-tape">
        {banner && (
          <div className="feed-flash">
            <span className="pulse-dot" />
            Configuration updated
          </div>
        )}
        {feed.slice(0, 6).map((r) => (
          <div key={r.uid} className={"tape-row" + (r.fresh ? " enter" : "")}>
            <div className="tape-line1">
              <span className="tape-time">{r.t}</span>
              <span className="tape-arr">agent →</span>
              <span className="tape-tool">{r.tool}</span>
            </div>
            <span className="tape-meta">{r.meta}</span>
          </div>
        ))}
        <div className="feed-fade" />
      </div>

      <div className="attrib">
        <div className="attrib-head">Attribution by source</div>
        {sorted.map((s) => {
          const pct = Math.round((s.weight / totalW) * 100)
          const isPulse = pulse.attr?.key === s.key
          return (
            <div
              key={s.key + (isPulse ? "#" + pulse.attr?.n : "")}
              className={"attrib-row" + (isPulse ? " pulsing" : "")}
            >
              <span className="attrib-name">{s.name}</span>
              <span className="attrib-pct">{pct}%</span>
              <span className="attrib-track">
                <span className="attrib-fill" style={{ width: pct + "%" }} />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
