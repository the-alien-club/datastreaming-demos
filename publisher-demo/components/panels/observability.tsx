"use client"

import { useEffect, useRef, useState } from "react"
import type {
  AttributionRow,
  Counters,
  ObservabilityPulse,
  TapeRow,
} from "@/lib/observability-types"
import { Icon } from "../icons"
import { BumpNum, InfoTip, RollingText } from "../widgets"

const MAX_TAPE_ROWS = 7

const fmtNum = (n: number) => n.toLocaleString()

/**
 * Cumulative royalty trend chart — area + line + animated end-dot.
 * Lifted verbatim from rev-2 panel-mid.jsx:197-224.
 */
function RoyaltyChart({ hist }: { hist: number[] }) {
  if (hist.length === 0) return null
  const W = 300
  const H = 60
  const pad = 3
  const min = Math.min(...hist)
  const max = Math.max(...hist)
  const range = max - min || 1
  const pts = hist.map((v, i) => {
    const x = pad + (i / Math.max(1, hist.length - 1)) * (W - 2 * pad)
    const y = H - pad - ((v - min) / range) * (H - 2 * pad)
    return [x, y] as const
  })
  const line = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const area =
    `M${pad} ${H} ` +
    pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") +
    ` L${W - pad} ${H} Z`
  const last = pts[pts.length - 1]
  return (
    <div className="roy-chart-wrap">
      <svg
        className="roy-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="royGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal-400)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--teal-400)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#royGrad)" />
        <path
          d={line}
          fill="none"
          stroke="var(--teal-300)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="roy-dot"
        style={{
          left: `${(last[0] / W) * 100}%`,
          top: `${(last[1] / H) * 100}%`,
        }}
      />
    </div>
  )
}

interface ObservabilityProps {
  counters: Counters
  royHist: number[]
  feed: TapeRow[]
  attribution: AttributionRow[]
  pulse: ObservabilityPulse
  /** Bumped on config save to flash the "Configuration updated" banner. */
  flash: number
  /** € accumulated this session (royalties − baseline). */
  sessionRoyalty: number
}

export function Observability({
  counters,
  royHist,
  feed,
  attribution,
  pulse,
  flash,
  sessionRoyalty,
}: ObservabilityProps) {
  // Config-saved flash banner
  const [banner, setBanner] = useState(false)
  useEffect(() => {
    if (!flash) return
    setBanner(true)
    const id = window.setTimeout(() => setBanner(false), 2400)
    return () => window.clearTimeout(id)
  }, [flash])

  // Per-increment royalty radial burst — re-keys on every royalties change.
  const [royFlash, setRoyFlash] = useState(0)
  const prevRoy = useRef(counters.royalties)
  useEffect(() => {
    if (counters.royalties !== prevRoy.current) {
      prevRoy.current = counters.royalties
      setRoyFlash((f) => f + 1)
    }
  }, [counters.royalties])

  const total = attribution.reduce((acc, r) => acc + r.eur, 0)
  const totalForShare = total || 1
  const maxEur = Math.max(...attribution.map((r) => r.eur), 0) || 1
  const sorted = [...attribution].sort((a, b) => b.eur - a.eur)

  return (
    <section className="panel p-feed">
      <header className="panel-head">
        <Icon name="activity" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Observability</span>
        <span className="spacer" />
        <span className="meta-chip live">
          <span className="pulse-dot" />
          Streaming
        </span>
        <InfoTip text="Every retrieval is logged, attributed, and metered." />
      </header>

      <div className="feed-counters">
        <div className="counter">
          <BumpNum display={fmtNum(counters.apiCalls)} />
          <span className="lab">API calls</span>
        </div>
        <div className="counter">
          <BumpNum display={fmtNum(counters.dataPoints)} />
          <span className="lab">Data points</span>
        </div>
        <div className="counter royalty">
          {royFlash > 0 && <span className="roy-flash" key={royFlash} />}
          <RollingText text={`€${counters.royalties.toFixed(3)}`} />
          <span className="lab">Royalties</span>
        </div>
      </div>

      <div className="roy-block">
        <div className="roy-block-head">
          <span className="lab">Royalties · session</span>
          <span className="delta">
            <Icon name="trendUp" size={12} />+€{sessionRoyalty.toFixed(3)}
          </span>
        </div>
        {royHist.length > 0 ? (
          <RoyaltyChart hist={royHist} />
        ) : (
          <div
            style={{
              height: 52,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--neutral-600)",
            }}
          >
            Trend builds as queries run.
          </div>
        )}
      </div>

      <div className="src-block">
        <div className="src-head">
          <span className="src-title">Royalties per source</span>
          <span className="src-total">€{total.toFixed(3)}</span>
        </div>
        {sorted.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--neutral-600)",
            }}
          >
            No attribution yet.
          </div>
        ) : (
          <div className="src-list">
            {sorted.map((s) => {
              const isPulse = pulse.attr?.key === s.key
              const share = Math.round((s.eur / totalForShare) * 100)
              const width = Math.max(3, (s.eur / maxEur) * 100)
              return (
                <div
                  key={s.key + (isPulse ? `#${pulse.attr?.n}` : "")}
                  className={"src-row" + (isPulse ? " pulsing" : "")}
                >
                  <div className="src-row-top">
                    <span className="src-name">{s.label}</span>
                    <span className="src-eur">
                      €{s.eur.toFixed(3)}
                      {isPulse && pulse.attr?.amount != null && (
                        <span className="src-blip" key={pulse.attr.n}>
                          +€{pulse.attr.amount.toFixed(4)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="src-row-bot">
                    <span className="src-track">
                      <span
                        className="src-fill"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="src-share">{share}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="feed-tape">
        <div className="tape-title">
          <span className="pulse-dot" />
          Live data access logs
        </div>
        {banner && (
          <div className="feed-flash">
            <span className="pulse-dot" />
            Configuration updated
          </div>
        )}
        {feed.length === 0 && !banner && (
          <div
            style={{
              padding: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--neutral-600)",
            }}
          >
            Waiting for tool calls — send a message in the Agent panel to start.
          </div>
        )}
        {feed.slice(0, MAX_TAPE_ROWS).map((r) => (
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
    </section>
  )
}
