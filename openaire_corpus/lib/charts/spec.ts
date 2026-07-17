// lib/charts/spec.ts
// The chart-spec contract shared by BOTH sides of the "graphs in notes" feature:
//   - the `corpus_aggregate` agent tool emits a spec (as a ```chart fenced block),
//   - the <NoteChart> renderer parses that fence back into a spec.
// One schema, so the tool can never emit a shape the renderer can't draw.
//
// The spec is a fenced code block inside a note's Markdown body:
//   ```chart
//   {"type":"bar","unit":" records","source":"count(records) by year","data":[…]}
//   ```
// It is self-contained (the computed numbers live in `data`) so a note exports
// to Markdown as a static, reproducible figure — matching the design prototype's
// `chartSvg()` (design/OpenAIRE Literature Research.dc.html).

import { z } from "zod"

/** Chart types whose data is a flat series of {label,value}. */
export const FLAT_CHART_TYPES = ["bar", "hbar", "donut", "line"] as const
/** Every chart type, including the composed stacked bar. */
export const CHART_TYPES = [...FLAT_CHART_TYPES, "stacked-bar"] as const

export type FlatChartType = (typeof FLAT_CHART_TYPES)[number]
export type ChartType = (typeof CHART_TYPES)[number]

// A hex colour (`#rgb`, `#rrggbb`, `#rrggbbaa`). Kept strict so a spec can never
// smuggle arbitrary CSS into the SVG fill.
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,8}$/, "color must be a hex string like #3FA46A")

const flatDatum = z.object({
  label: z.string().min(1).max(120),
  value: z.number().finite().nonnegative(),
  color: hexColor.optional(),
})

const stackedSegment = z.object({
  key: z.string().min(1).max(120),
  value: z.number().finite().nonnegative(),
  color: hexColor.optional(),
})

const stackedDatum = z.object({
  label: z.string().min(1).max(120),
  segments: z.array(stackedSegment).min(1).max(24),
})

const commonFields = {
  /** Unit suffix shown in the data table, e.g. " records". Optional. */
  unit: z.string().max(40).optional(),
  /** Human-readable aggregation shown under "View data & source", e.g.
   *  "count(records) group by publication year". Lets a reader re-run it. */
  source: z.string().max(200).optional(),
}

const flatSpec = z.object({
  type: z.enum(FLAT_CHART_TYPES),
  ...commonFields,
  data: z.array(flatDatum).min(1).max(200),
})

const stackedSpec = z.object({
  type: z.literal("stacked-bar"),
  ...commonFields,
  data: z.array(stackedDatum).min(1).max(60),
})

/** The validated chart spec — a discriminated union on `type`. */
export const chartSpecSchema = z.discriminatedUnion("type", [flatSpec, stackedSpec])

export type ChartSpec = z.infer<typeof chartSpecSchema>
export type FlatChartSpec = z.infer<typeof flatSpec>
export type StackedChartSpec = z.infer<typeof stackedSpec>
export type ChartDatum = z.infer<typeof flatDatum>
export type StackedDatum = z.infer<typeof stackedDatum>

/**
 * Parse and validate the JSON body of a ```chart fence. Never throws — returns a
 * discriminated result so the renderer can show a graceful error line instead of
 * crashing the note (the agentic no-throw rule applies to the render path too).
 */
export function parseChartSpec(
  raw: string,
): { ok: true; spec: ChartSpec } | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: "invalid JSON" }
  }
  const res = chartSpecSchema.safeParse(json)
  if (!res.success) {
    return { ok: false, error: res.error.issues[0]?.message ?? "invalid chart spec" }
  }
  return { ok: true, spec: res.data }
}

/** Serialise a spec into the ```chart fenced block the agent pastes into a note. */
export function renderChartFence(spec: ChartSpec): string {
  return "```chart\n" + JSON.stringify(spec) + "\n```"
}

// --- Colours ---------------------------------------------------------------
// Canonical open-access bucket colours, matching the design prototype's donut.
export const OA_COLORS: Record<string, string> = {
  gold: "#E0A92B",
  green: "#3FA46A",
  hybrid: "#4687E6",
  bronze: "#B87333",
  closed: "#8A8A8A",
}

// Categorical palette for donut/stacked segments (teal-led to match the brand).
// Used when a datum carries no explicit colour.
export const CHART_PALETTE = [
  "#2FB6A8",
  "#4687E6",
  "#E0A92B",
  "#3FA46A",
  "#B36FD1",
  "#E06C5E",
  "#6BA3C4",
  "#C4926B",
  "#7CB342",
  "#8A8A8A",
] as const

/** Pick a stable palette colour by index (wraps around). */
export function paletteColor(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length]
}
