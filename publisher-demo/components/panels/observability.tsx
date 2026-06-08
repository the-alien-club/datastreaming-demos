"use client"

import { useEffect, useState } from "react"
import { useDemoEventListener } from "@/hooks/use-demo-events"
import { Icon } from "../icons"
import { BumpNum, InfoTip, RollingText } from "../widgets"

const MAX_TAPE_ROWS = 6
const MAX_ATTRIBUTION_ROWS = 4

interface TapeRow {
  uid: number
  t: string
  tool: string
  meta: string
  fresh: boolean
}

interface AttributionRow {
  key: string
  label: string
  weight: number
  pulseN: number
}

interface Counters {
  apiCalls: number
  tokens: number
  royalties: number
}

const fmtTokens = (n: number) => {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function hms(t: number): string {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const pad = (n: number) => String(n).padStart(2, "0")

export function Observability() {
  const [counters, setCounters] = useState<Counters>({
    apiCalls: 0,
    tokens: 0,
    royalties: 0,
  })
  const [tape, setTape] = useState<TapeRow[]>([])
  const [attribution, setAttribution] = useState<AttributionRow[]>([])
  const [bannerKey, setBannerKey] = useState(0)
  const [banner, setBanner] = useState(false)

  // Reset everything when the chat resets (mode switch).
  useDemoEventListener("reset-chat", () => {
    setCounters({ apiCalls: 0, tokens: 0, royalties: 0 })
    setTape([])
    setAttribution([])
  })

  // Configuration save flash.
  useDemoEventListener("config-saved", () => {
    setBannerKey((k) => k + 1)
    setBanner(true)
  })
  useEffect(() => {
    if (!banner) return
    const id = window.setTimeout(() => setBanner(false), 2400)
    return () => window.clearTimeout(id)
  }, [banner, bannerKey])

  // Per-call ripple. Plan timing:
  //   T+0    server-resolved event arrives
  //   T+100  push tape row
  //   T+200  bump counters
  //   T+400  attribution
  useDemoEventListener("tool-call", (event) => {
    const meta = formatTapeMeta(event.tokensEstimate, event.royaltyEur, event.attributionLabel)
    const row: TapeRow = {
      uid: event.timestamp + Math.random(),
      t: hms(event.timestamp),
      tool: formatTapeTool(event.toolName, event.args),
      meta,
      fresh: true,
    }

    window.setTimeout(() => {
      setTape((prev) => [row, ...prev.map((r) => ({ ...r, fresh: false }))].slice(0, MAX_TAPE_ROWS + 2))
    }, 100)

    window.setTimeout(() => {
      setCounters((c) => ({
        apiCalls: c.apiCalls + 1,
        tokens: c.tokens,
        royalties: round4(c.royalties + event.royaltyEur),
      }))
    }, 200)

    window.setTimeout(() => {
      setAttribution((rows) => bumpAttribution(rows, event))
    }, 400)
  })

  // Token counter rolls once per turn, at finish, from the usage event.
  useDemoEventListener("usage", (event) => {
    setCounters((c) => ({ ...c, tokens: c.tokens + event.totalTokens }))
  })

  const totalWeight = attribution.reduce((acc, r) => acc + r.weight, 0) || 1
  const sortedAttribution = [...attribution].sort((a, b) => b.weight - a.weight).slice(0, MAX_ATTRIBUTION_ROWS)

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
          <RollingText text={`€${counters.royalties.toFixed(3)}`} />
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
        {tape.length === 0 && !banner && (
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
        {tape.slice(0, MAX_TAPE_ROWS).map((r) => (
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
        {sortedAttribution.length === 0 ? (
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
          sortedAttribution.map((row) => {
            const pct = Math.round((row.weight / totalWeight) * 100)
            return (
              <div
                key={`${row.key}#${row.pulseN}`}
                className={"attrib-row" + (row.pulseN > 0 ? " pulsing" : "")}
              >
                <span className="attrib-name">{row.label}</span>
                <span className="attrib-pct">{pct}%</span>
                <span className="attrib-track">
                  <span className="attrib-fill" style={{ width: `${pct}%` }} />
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function formatTapeTool(toolName: string, args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return `${toolName}()`
  const entries = Object.entries(args).slice(0, 2)
  const summary = entries
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}=${JSON.stringify(v.length > 28 ? `${v.slice(0, 25)}…` : v)}`
      if (Array.isArray(v)) return `${k}=[${v.length}]`
      if (v && typeof v === "object") return `${k}={…}`
      return `${k}=${String(v)}`
    })
    .join(", ")
  const more = Object.keys(args).length > entries.length ? ", …" : ""
  return `${toolName}(${summary}${more})`
}

function formatTapeMeta(tokens: number, royaltyEur: number, attributionLabel: string): string {
  const tokenLabel = tokens > 0 ? `${tokens.toLocaleString()} tok` : "—"
  const eurLabel = royaltyEur > 0 ? `€${royaltyEur.toFixed(4)}` : "no price"
  return `${tokenLabel} · ${eurLabel} · ${attributionLabel}`
}

function bumpAttribution(rows: AttributionRow[], event: { attributionKey: string; attributionLabel: string; kind: "dataset" | "api" }): AttributionRow[] {
  const weightDelta = event.kind === "dataset" ? 9 : 4
  const idx = rows.findIndex((r) => r.key === event.attributionKey)
  if (idx === -1) {
    return [
      ...rows,
      {
        key: event.attributionKey,
        label: event.attributionLabel,
        weight: weightDelta,
        pulseN: 1,
      },
    ]
  }
  const next = [...rows]
  next[idx] = {
    ...next[idx],
    weight: next[idx].weight + weightDelta,
    pulseN: next[idx].pulseN + 1,
  }
  return next
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
