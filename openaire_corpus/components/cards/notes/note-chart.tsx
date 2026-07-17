"use client"

import { useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  parseChartSpec,
  type ChartSpec,
  type FlatChartSpec,
  type StackedChartSpec,
} from "@/lib/charts/spec"

// Renders a ```chart fenced block embedded in a note body. The spec carries the
// already-computed corpus counts (see lib/agent/tools/corpus-aggregate), so this
// is a pure presentation component — hand-built SVG/flex, no charting library,
// 1:1 with the design prototype's chartSvg(). Every chart ships an auditable
// « View data & source » table so a reader can verify the figures.

const DEFAULT_COLOR = "var(--brand-teal)"
const CHART_PX = 132 // max bar / plot height in px

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

/** Parse the raw fence body and render, or a graceful error line (never throws). */
export function NoteChartFence({ raw }: { raw: string }) {
  const t = useTranslations("notes.chart")
  const parsed = useMemo(() => parseChartSpec(raw), [raw])
  if (!parsed.ok) {
    return (
      <span className="my-2 block font-mono text-xs text-destructive">
        {t("parseError")} — {parsed.error}
      </span>
    )
  }
  return <NoteChart spec={parsed.spec} />
}

export function NoteChart({ spec }: { spec: ChartSpec }) {
  return (
    <div className="my-4 rounded-md border border-border bg-card px-4 py-3.5">
      {spec.type === "donut" ? (
        <DonutChart spec={spec} />
      ) : spec.type === "line" ? (
        <LineChart spec={spec} />
      ) : spec.type === "hbar" ? (
        <HBarChart spec={spec} />
      ) : spec.type === "stacked-bar" ? (
        <StackedBarChart spec={spec} />
      ) : (
        <BarChart spec={spec} />
      )}
      <ChartDataTable spec={spec} />
    </div>
  )
}

// --- bar (vertical) --------------------------------------------------------

function BarChart({ spec }: { spec: FlatChartSpec }) {
  const max = Math.max(1, ...spec.data.map((d) => d.value))
  return (
    <div className="flex items-end gap-2" style={{ height: CHART_PX + 24 }}>
      {spec.data.map((d, i) => {
        const h = Math.max(3, Math.round((d.value / max) * CHART_PX))
        return (
          <div
            key={`${d.label}-${i}`}
            className="flex flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className="font-mono text-[10px] text-neutral-300">{fmt(d.value)}</span>
            <span
              className="w-full max-w-11 rounded-t-[3px]"
              style={{
                height: h,
                background: `linear-gradient(180deg, ${d.color ?? DEFAULT_COLOR}, color-mix(in srgb, ${d.color ?? DEFAULT_COLOR} 45%, var(--card)))`,
              }}
            />
            <span className="text-center font-mono text-[9.5px] leading-tight text-neutral-500">
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// --- hbar (horizontal) -----------------------------------------------------

function HBarChart({ spec }: { spec: FlatChartSpec }) {
  const max = Math.max(1, ...spec.data.map((d) => d.value))
  return (
    <div className="flex flex-col gap-1.5">
      {spec.data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex items-center gap-2.5">
          <span className="w-32 shrink-0 truncate text-right text-[11px] text-neutral-300" title={d.label}>
            {d.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted/30">
            <span
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${Math.max(1, (d.value / max) * 100)}%`,
                background: d.color ?? DEFAULT_COLOR,
              }}
            />
          </span>
          <span className="w-12 shrink-0 font-mono text-[10.5px] text-neutral-400">
            {fmt(d.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// --- donut -----------------------------------------------------------------

function DonutChart({ spec }: { spec: FlatChartSpec }) {
  const t = useTranslations("notes.chart")
  const total = spec.data.reduce((a, d) => a + d.value, 0)
  const cx = 60
  const cy = 60
  const r = 46
  const sw = 18
  const C = 2 * Math.PI * r

  // Cumulative fraction BEFORE each slice — precomputed so the render map stays
  // pure (no reassigned closure during render).
  const offsets: number[] = []
  spec.data.reduce((acc, d) => {
    offsets.push(acc)
    return acc + (total ? d.value / total : 0)
  }, 0)
  const segs = spec.data.map((d, i) => {
    const frac = total ? d.value / total : 0
    return (
      <circle
        key={`${d.label}-${i}`}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={d.color ?? DEFAULT_COLOR}
        strokeWidth={sw}
        strokeDasharray={`${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`}
        strokeDashoffset={`${(-offsets[i] * C).toFixed(2)}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    )
  })

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="size-28 shrink-0">
        {segs}
        <text
          x="60"
          y="56"
          textAnchor="middle"
          className="fill-foreground font-mono text-[15px] font-semibold"
        >
          {fmt(total)}
        </text>
        <text
          x="60"
          y="71"
          textAnchor="middle"
          className="fill-muted-foreground font-mono text-[8px]"
        >
          {t("total")}
        </text>
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        {spec.data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex items-center gap-2 text-[11.5px] text-neutral-200">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: d.color ?? DEFAULT_COLOR }}
            />
            <span className="flex-1">{d.label}</span>
            <span className="font-mono text-muted-foreground">
              {fmt(d.value)} · {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- line (with area fill) -------------------------------------------------

function LineChart({ spec }: { spec: FlatChartSpec }) {
  const W = 460
  const H = 150
  const pad = 24
  const max = Math.max(1, ...spec.data.map((d) => d.value))
  const n = spec.data.length
  const step = n > 1 ? (W - pad * 2) / (n - 1) : 0
  const pts = spec.data.map((d, i) => [
    pad + i * step,
    H - pad - (d.value / max) * (H - pad * 2),
  ])
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  const area =
    n > 0
      ? `${line} L${pts[n - 1][0].toFixed(1)} ${H - pad} L${pts[0][0].toFixed(1)} ${H - pad} Z`
      : ""
  const gid = useMemo(() => `chart-area-${Math.round(pts[0]?.[0] ?? 0)}-${n}`, [pts, n])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={DEFAULT_COLOR} stopOpacity="0.28" />
          <stop offset="1" stopColor={DEFAULT_COLOR} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={DEFAULT_COLOR} strokeWidth={2} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={3} fill={DEFAULT_COLOR} stroke="var(--background)" strokeWidth={1.5} />
          <text
            x={p[0]}
            y={p[1] - 7}
            textAnchor="middle"
            className="fill-neutral-300 font-mono text-[9px]"
          >
            {fmt(spec.data[i].value)}
          </text>
          <text
            x={p[0]}
            y={H - 6}
            textAnchor="middle"
            className="fill-neutral-500 font-mono text-[9px]"
          >
            {spec.data[i].label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// --- stacked bar -----------------------------------------------------------

function StackedBarChart({ spec }: { spec: StackedChartSpec }) {
  const totals = spec.data.map((d) => d.segments.reduce((a, s) => a + s.value, 0))
  const max = Math.max(1, ...totals)
  // Legend: distinct segment keys in first-seen order, with their colour.
  const legend: { key: string; color: string }[] = []
  const seen = new Set<string>()
  for (const d of spec.data) {
    for (const s of d.segments) {
      if (!seen.has(s.key)) {
        seen.add(s.key)
        legend.push({ key: s.key, color: s.color ?? DEFAULT_COLOR })
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2" style={{ height: CHART_PX + 24 }}>
        {spec.data.map((d, i) => {
          const colH = Math.max(3, Math.round((totals[i] / max) * CHART_PX))
          return (
            <div key={`${d.label}-${i}`} className="flex flex-1 flex-col items-center justify-end gap-1.5">
              <span className="font-mono text-[10px] text-neutral-300">{fmt(totals[i])}</span>
              <span
                className="flex w-full max-w-11 flex-col-reverse overflow-hidden rounded-t-[3px]"
                style={{ height: colH }}
              >
                {d.segments.map((s, j) => (
                  <span
                    key={`${s.key}-${j}`}
                    style={{
                      height: `${totals[i] ? (s.value / totals[i]) * 100 : 0}%`,
                      background: s.color ?? DEFAULT_COLOR,
                    }}
                    title={`${s.key}: ${fmt(s.value)}`}
                  />
                ))}
              </span>
              <span className="text-center font-mono text-[9.5px] leading-tight text-neutral-500">
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-neutral-300">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: l.color }} />
            {l.key}
          </span>
        ))}
      </div>
    </div>
  )
}

// --- auditable data table --------------------------------------------------

function ChartDataTable({ spec }: { spec: ChartSpec }) {
  const t = useTranslations("notes.chart")
  const unit = spec.unit ?? ""
  const rows: { label: string; series?: string; value: number }[] =
    spec.type === "stacked-bar"
      ? spec.data.flatMap((d) =>
          d.segments.map((s) => ({ label: d.label, series: s.key, value: s.value })),
        )
      : spec.data.map((d) => ({ label: d.label, value: d.value }))
  const hasSeries = spec.type === "stacked-bar"

  return (
    <details className="mt-2 rounded-md border border-border bg-background">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 font-mono text-[10.5px] text-brand-teal">
        ▸ {t("viewData")}
      </summary>
      {spec.source && (
        <div className="px-2.5 pt-1.5 font-mono text-[10px] text-neutral-600">
          {t("query")}: {spec.source}
        </div>
      )}
      <table className="mt-0.5 w-full border-collapse text-[11.5px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-border px-2.5 py-1 text-neutral-200">{r.label}</td>
              {hasSeries && (
                <td className="border-b border-border px-2.5 py-1 text-neutral-400">{r.series}</td>
              )}
              <td className="border-b border-border px-2.5 py-1 text-right font-mono text-neutral-200">
                {fmt(r.value)}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
