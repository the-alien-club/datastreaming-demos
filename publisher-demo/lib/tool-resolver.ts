/**
 * Resolves a live tool-call (from Mode A's data-toolCall chunks or Mode B's
 * job toolActivity entries) into a `ScriptedTool` — the shape `fireEvent`
 * dispatches to ripple across the five demo panels.
 *
 * The resolver is intentionally permissive: any tool whose name we don't
 * recognise still emits a ripple by falling back to "dataset" + the first
 * datasource row. The cross-panel choreography never silently drops.
 */

import { computeRoyalty, type PricingMap } from "./pricing"
import type { ScriptedTool } from "./seed-data"

const API_PREFIX_TO_ROW: Record<string, string> = {
  crossref_: "crossref",
  semantic_scholar_: "s2",
  s2_: "s2",
  orcid_: "orcid",
  crm_: "crm",
  publisher_crm_: "crm",
}

const DATASET_ID_PREFIX_TO_ROW: Record<string, string> = {
  "bx-": "bx-neuro",
  "bxn-": "bx-neuro",
  "bxg-": "bx-genom",
  "pmc-": "pmc-oa",
  "ct-": "pmc-ct",
  "rev-": "pmc-rev",
  notes_: "notes",
}

const FRIENDLY_SOURCE: Record<string, string> = {
  "bx-neuro": "bioRxiv/Neuroscience",
  "bx-genom": "bioRxiv/Genomics",
  "pmc-oa": "PMC/Open-access",
  "pmc-ct": "PMC/Clinical trials",
  notes: "Internal clinical notes",
  crossref: "Crossref Search",
  s2: "Semantic Scholar",
  orcid: "ORCID lookup",
  crm: "Publisher CRM",
}

function nowHms(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const pad = (n: number) => String(n).padStart(2, "0")

function shortArgs(args: unknown): string {
  if (args === null || args === undefined) return ""
  if (typeof args === "string") return args.length > 36 ? `${args.slice(0, 33)}…` : args
  if (typeof args !== "object") return String(args)
  const a = args as Record<string, unknown>
  const parts: string[] = []
  for (const [k, v] of Object.entries(a)) {
    if (parts.length >= 2) {
      parts.push("…")
      break
    }
    const value =
      typeof v === "string"
        ? `"${v.length > 28 ? `${v.slice(0, 25)}…` : v}"`
        : Array.isArray(v)
          ? `[${v.length}]`
          : typeof v === "object"
            ? "{…}"
            : String(v)
    parts.push(`${k}=${value}`)
  }
  return parts.join(", ")
}

function findApiRow(toolName: string): string | null {
  for (const [prefix, row] of Object.entries(API_PREFIX_TO_ROW)) {
    if (toolName.startsWith(prefix)) return row
  }
  return null
}

function findDsRow(args: unknown): string {
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>
    const datasets = a.datasets
    if (Array.isArray(datasets) && datasets.length > 0) {
      const first = String(datasets[0]).toLowerCase()
      if (first.includes("neuro")) return "bx-neuro"
      if (first.includes("genom")) return "bx-genom"
      if (first.includes("notes") || first.includes("clinical")) return "notes"
      if (first.includes("pmc") || first.includes("pubmed")) return "pmc-oa"
    }
    const id = typeof a.id === "string" ? a.id : null
    if (id) {
      for (const [prefix, row] of Object.entries(DATASET_ID_PREFIX_TO_ROW)) {
        if (id.toLowerCase().startsWith(prefix)) return row
      }
    }
  }
  return "bx-neuro"
}

export function resolveLiveTool(
  toolName: string,
  args: unknown,
  pricing: PricingMap,
): ScriptedTool {
  const apiRow = findApiRow(toolName)
  const isDataset = !apiRow

  const sourceKey = isDataset ? findDsRow(args) : apiRow!
  const royalty = computeRoyalty(pricing, toolName, args, isDataset ? "dataset" : "api")
  const tokens = estimateTokens(args)
  const argsStr = safeStringify(args)
  const t = nowHms()
  const summaryArgs = shortArgs(args)
  const friendly = FRIENDLY_SOURCE[sourceKey] ?? sourceKey

  return {
    icon: isDataset ? "search" : "plug",
    name: toolName,
    type: isDataset ? "dataset" : "api",
    sourceKey,
    dsRow: isDataset ? sourceKey : undefined,
    apiRow: isDataset ? undefined : sourceKey,
    node: "specialist",
    summary: `${summaryArgs} · ${friendly}`,
    args: argsStr,
    result: "(live — see Live access panel)",
    t,
    feedTool: summaryArgs.length > 0 ? `${toolName}(${summaryArgs})` : toolName,
    feedMeta: `${tokens} tok · €${royalty.toFixed(4)} · ${friendly}`,
    hits: 1,
    tokens,
    royalty,
  }
}

function estimateTokens(args: unknown): number {
  // Cheap heuristic — real token counts arrive only at finish time, but the
  // demo wants per-tool feed rows immediately. ~1k for retrieval, ~300 for
  // lookups, scaled by argument size.
  const str = safeStringify(args)
  if (str.length < 60) return 320
  if (str.length < 200) return 1240
  return 4820
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
