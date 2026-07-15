// lib/mcp/normalize.ts
// Pure functional layer mapping OpenAIRE Graph products → our Document row shape.
//
// Consumers:
//   - lib/documents/resolver.ts        (background metadata resolution)
//   - lib/agent/tools/corpus.ts        (corpus.add tool handler, via the client)
//
// Side-effect-free: no Prisma import, no logging I/O. Callers receive structured
// diagnostics and decide what to do with them.
//
// See: playbook/mcp-client.md

import type {
  OaInstance,
  OaResearchProduct,
} from "@/lib/openaire/types"
import {
  mapInstanceType,
  mapLang,
  mapProductType,
  normalizeDoi,
  stripEntityPrefix,
} from "@/lib/mcp/vocab"

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

/**
 * Normalized document row ready to feed into the resolver's update.
 * Standalone (no Prisma import) so it compiles regardless of migration state.
 * All metadata fields are optional/nullable — OpenAIRE responses are null-heavy
 * (authors, subjects, openAccessColor legitimately absent); null means UNKNOWN,
 * never a synthesized default.
 */
export interface NormalizedDocument {
  openaireId: string // bare OpenAIRE id (Document PK)
  doi?: string | null
  title: string
  author?: string | null
  year?: number | null
  dateLabel?: string | null
  docType: string // publication | dataset | software | other
  instanceType?: string | null // article | preprint | review | …
  lang?: string | null
  publisher?: string | null
  venue?: string | null
  abstract?: string | null
  openAccessColor?: string | null
  isGreen?: boolean | null
  bestAccessRight?: string | null
  peerReviewed?: boolean | null
  citationCount?: number | null
  influenceClass?: string | null
  fulltextUrl?: string | null
  sourceRepoUrl?: string | null
  funder?: string | null
  rawMetadata: unknown // full product preserved for re-normalize without re-fetch
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** First non-empty string from a list, trimmed; null if none. */
function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim()
  }
  return null
}

/** Extract a 4-digit year from a "YYYY-MM-DD" / "YYYY" date string. */
function yearFromDate(date: string | null | undefined): number | null {
  if (typeof date !== "string") return null
  const m = /(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

/** Preferred DOI: first `doi`-scheme pid, normalized to bare form. */
function pickDoi(p: OaResearchProduct): string | null {
  for (const pid of p.pids ?? []) {
    if (pid?.scheme?.toLowerCase() === "doi") {
      const doi = normalizeDoi(pid.value)
      if (doi) return doi
    }
  }
  return null
}

/** True when ANY instance is refereed (peer-reviewed). Null when no instance
 *  carries a refereed flag at all (unknown, not "false"). */
function derivePeerReviewed(instances: OaInstance[] | null | undefined): boolean | null {
  let sawFlag = false
  for (const inst of instances ?? []) {
    if (inst?.refereed == null) continue
    sawFlag = true
    if (inst.refereed === "peerReviewed") return true
  }
  return sawFlag ? false : null
}

/** The finer display kind ("article", "preprint", …) from the richest instance,
 *  or null when no instance type maps. */
function deriveInstanceType(instances: OaInstance[] | null | undefined): string | null {
  for (const inst of instances ?? []) {
    const mapped = mapInstanceType(inst?.type)
    if (mapped) return mapped
  }
  return null
}

/**
 * Best open-access full-text candidate URL for the UI, mined from OPEN
 * instances. This is a display convenience only — the ingest worker re-derives
 * and ranks its own candidate list. Prefers a repository-hosted OPEN url, then
 * any OPEN url; returns null when nothing is open.
 */
function pickFulltextUrl(instances: OaInstance[] | null | undefined): string | null {
  let firstOpen: string | null = null
  for (const inst of instances ?? []) {
    const label = inst?.accessRight?.label?.toUpperCase()
    if (label !== "OPEN") continue
    for (const url of inst.urls ?? []) {
      if (typeof url !== "string" || url.trim() === "") continue
      if (firstOpen == null) firstOpen = url
      // Prefer a non-doi.org url (usually the actual repository/PDF landing).
      if (!/doi\.org/.test(url)) return url
    }
  }
  return firstOpen
}

/** hostedBy landing page of the first instance carrying a url — the "Source /
 *  repository" surface. */
function pickSourceRepoUrl(instances: OaInstance[] | null | undefined): string | null {
  for (const inst of instances ?? []) {
    const first = inst?.urls?.find((u) => typeof u === "string" && u.trim() !== "")
    if (first) return first
  }
  return null
}

/** Primary funder short name, best-effort from the projects relation. */
function pickFunder(p: OaResearchProduct): string | null {
  for (const proj of p.projects ?? []) {
    const short = firstNonEmpty(proj?.funder?.shortName, proj?.funder?.name)
    if (short) return short
  }
  return null
}

/** Display author string: first author's fullName, "+ N others" appended. */
function deriveAuthor(p: OaResearchProduct): string | null {
  const authors = (p.authors ?? []).filter((a) => firstNonEmpty(a?.fullName))
  if (authors.length === 0) return null
  const sorted = [...authors].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  const first = firstNonEmpty(sorted[0].fullName)
  if (!first) return null
  if (sorted.length === 1) return first
  if (sorted.length === 2) return `${first}, ${firstNonEmpty(sorted[1].fullName)}`
  return `${first}, et al.`
}

// ---------------------------------------------------------------------------
// normalizeDocument
// ---------------------------------------------------------------------------

/**
 * Normalize a single OpenAIRE research product into our NormalizedDocument.
 * Returns null when the product has no usable id or no title — the resolver
 * treats that as a failed attempt.
 */
export function normalizeDocument(
  p: OaResearchProduct,
): NormalizedDocument | null {
  const rawId = typeof p.id === "string" ? p.id.trim() : ""
  if (rawId === "") return null
  const openaireId = stripEntityPrefix(rawId)

  const title = firstNonEmpty(p.mainTitle)
  if (title === null) return null

  const docType = mapProductType(p.type)
  const instances = p.instances ?? []

  const abstract = firstNonEmpty(...(p.descriptions ?? []))
  const impact = p.indicators?.citationImpact ?? null

  return {
    openaireId,
    doi: pickDoi(p),
    title,
    author: deriveAuthor(p),
    year: yearFromDate(p.publicationDate),
    dateLabel: firstNonEmpty(p.publicationDate),
    docType,
    instanceType: deriveInstanceType(instances) ?? docType,
    lang: mapLang(p.language?.code),
    publisher: firstNonEmpty(p.publisher),
    venue: firstNonEmpty(p.container?.name),
    abstract,
    openAccessColor: firstNonEmpty(p.openAccessColor),
    isGreen: typeof p.isGreen === "boolean" ? p.isGreen : null,
    bestAccessRight: firstNonEmpty(p.bestAccessRight?.label),
    peerReviewed: derivePeerReviewed(instances),
    citationCount:
      typeof impact?.citationCount === "number" ? impact.citationCount : null,
    influenceClass: firstNonEmpty(impact?.influenceClass),
    fulltextUrl: pickFulltextUrl(instances),
    sourceRepoUrl:
      firstNonEmpty(p.codeRepositoryUrl) ?? pickSourceRepoUrl(instances),
    funder: pickFunder(p),
    rawMetadata: p,
  }
}

// ---------------------------------------------------------------------------
// normalizeMany
// ---------------------------------------------------------------------------

/**
 * Normalize a batch of OpenAIRE products, silently dropping those that
 * normalizeDocument rejects (missing id or title).
 */
export function normalizeMany(products: OaResearchProduct[]): NormalizedDocument[] {
  const results: NormalizedDocument[] = []
  for (const p of products) {
    const doc = normalizeDocument(p)
    if (doc !== null) results.push(doc)
  }
  return results
}
