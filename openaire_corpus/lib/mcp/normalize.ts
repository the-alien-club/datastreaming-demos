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

import type { OaAuthor, OaResearchProduct } from "@/lib/openaire/types"
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

/** Bare DOI from the flattened `doi` field. */
function pickDoi(p: OaResearchProduct): string | null {
  return normalizeDoi(p.doi)
}

/** Read a language code from either the flat string or the `{code}` object. */
function pickLang(p: OaResearchProduct): string | null {
  if (typeof p.language === "string") return mapLang(p.language)
  if (p.language && typeof p.language === "object") return mapLang(p.language.code)
  return null
}

/** Display author string: first author's name, "et al." beyond two. */
function deriveAuthor(authors: OaAuthor[] | null | undefined): string | null {
  const named = (authors ?? []).filter((a) => firstNonEmpty(a?.name))
  if (named.length === 0) return null
  const first = firstNonEmpty(named[0].name)
  if (!first) return null
  if (named.length === 1) return first
  if (named.length === 2) return `${first}, ${firstNonEmpty(named[1].name)}`
  return `${first}, et al.`
}

/**
 * Derive bestAccessRight when the flattened product omits it: any OA colour or
 * the green flag implies OPEN; otherwise unknown (null — never "closed").
 */
function deriveAccessRight(p: OaResearchProduct): string | null {
  if (firstNonEmpty(p.open_access_color) || p.is_green === true) return "OPEN"
  return null
}

// ---------------------------------------------------------------------------
// normalizeDocument
// ---------------------------------------------------------------------------

/**
 * Normalize a single OpenAIRE research product (hosted-MCP flattened shape) into
 * our NormalizedDocument. Returns null when the product has no usable id or no
 * title — the resolver treats that as a failed attempt.
 */
export function normalizeDocument(
  p: OaResearchProduct,
): NormalizedDocument | null {
  const rawId = typeof p.id === "string" ? p.id.trim() : ""
  if (rawId === "") return null
  const openaireId = stripEntityPrefix(rawId)

  const title = firstNonEmpty(p.title)
  if (title === null) return null

  const docType = mapProductType(p.type)
  const metrics = p.metrics ?? null
  const citationCount =
    typeof metrics?.citation_count === "number"
      ? metrics.citation_count
      : typeof p.citations === "number"
        ? p.citations
        : null

  return {
    openaireId,
    doi: pickDoi(p),
    title,
    author: deriveAuthor(p.authors),
    year: yearFromDate(p.publication_date),
    dateLabel: firstNonEmpty(p.publication_date),
    docType,
    instanceType: mapInstanceType(p.instance_type) ?? docType,
    lang: pickLang(p),
    publisher: firstNonEmpty(p.publisher),
    venue: firstNonEmpty(p.journal),
    abstract: firstNonEmpty(p.abstract),
    openAccessColor: firstNonEmpty(p.open_access_color),
    isGreen: typeof p.is_green === "boolean" ? p.is_green : null,
    bestAccessRight: deriveAccessRight(p),
    peerReviewed: typeof p.peer_reviewed === "boolean" ? p.peer_reviewed : null,
    citationCount,
    influenceClass: firstNonEmpty(metrics?.influence_class),
    // The details endpoint returns only the doi.org resolver url; real OA PDF
    // selection happens in the worker. Leave the UI hint null unless the url is
    // clearly not the DOI resolver.
    fulltextUrl:
      p.url && !/doi\.org/.test(p.url) ? firstNonEmpty(p.url) : null,
    sourceRepoUrl: firstNonEmpty(p.hosted_by?.[0]) ?? firstNonEmpty(p.url),
    // Funder is not in the flattened details response; left null (unknown).
    funder: null,
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
