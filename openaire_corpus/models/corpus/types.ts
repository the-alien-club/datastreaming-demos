// models/corpus/types.ts
// Zod schemas for corpus API request validation and their inferred types.
// These are what route handlers validate against and what client hooks import.
//
// DB-derived shapes (CorpusSnapshot, DocumentRow, CorpusDiff) live in
// schema.ts, not here — per playbook/models.md.

import { z } from "zod"

import { CORPUS_REASON_MAX_LEN } from "@/lib/constants"

// ---------------------------------------------------------------------------
// Client-side filter state
// ---------------------------------------------------------------------------

/**
 * CorpusFilters captures the active filter selections for the Corpus
 * comprehension panel. All fields are optional — missing means "no filter".
 * Multi-select fields (type, lang, oa, funder) are serialised as CSV strings in
 * URLSearchParams; use the helpers below to convert.
 */
export const corpusFiltersSchema = z.object({
  /** Comma-separated research-product display types, e.g. "article,preprint" */
  type: z.string().optional(),
  /** Comma-separated ISO 639-1 language codes, e.g. "en,fr" */
  lang: z.string().optional(),
  /**
   * Comma-separated open-access buckets: "gold" | "green" | "hybrid" |
   * "bronze" | "closed". Derived from openAccessColor + isGreen +
   * bestAccessRight — see classifyOpenAccess() / the snapshot query.
   */
  oa: z.string().optional(),
  /**
   * Peer-review filter: "peer_reviewed" | "not_peer_reviewed". Backed by the
   * Document.peerReviewed tri-state (null = unknown, excluded from both).
   */
  peer: z.string().optional(),
  /** Comma-separated funder short names, e.g. "EC,NIH" */
  funder: z.string().optional(),
  /** Comma-separated AppSession ids — filter to docs a given session contributed */
  session: z.string().optional(),
  /** Publication year lower bound (inclusive), e.g. 2013 */
  yearFrom: z.coerce.number().int().optional(),
  /** Publication year upper bound (inclusive), e.g. 2016 */
  yearTo: z.coerce.number().int().optional(),
  /** When true, include documents with no date in the result set */
  undated: z.coerce.boolean().optional(),
  /** Free-text query; empty string is treated as absent */
  q: z.string().trim().min(1).optional(),
})

export type CorpusFilters = z.infer<typeof corpusFiltersSchema>

/** Multi-select CSV filter keys (the ones removeFromFilter operates on). */
export type MultiFilterKey =
  | "type"
  | "lang"
  | "oa"
  | "peer"
  | "funder"
  | "session"

/**
 * Serialise a CorpusFilters object into URLSearchParams.
 * Multi-select fields are kept as a single CSV parameter.
 * Absent or undefined values are omitted.
 */
export function corpusFiltersToParams(filters: CorpusFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filters.type) p.set("type", filters.type)
  if (filters.lang) p.set("lang", filters.lang)
  if (filters.oa) p.set("oa", filters.oa)
  if (filters.peer) p.set("peer", filters.peer)
  if (filters.funder) p.set("funder", filters.funder)
  if (filters.session) p.set("session", filters.session)
  if (filters.yearFrom !== undefined) p.set("yearFrom", String(filters.yearFrom))
  if (filters.yearTo !== undefined) p.set("yearTo", String(filters.yearTo))
  if (filters.undated !== undefined) p.set("undated", String(filters.undated))
  if (filters.q !== undefined && filters.q.trim().length > 0) p.set("q", filters.q.trim())
  return p
}

/**
 * Deserialise URLSearchParams into a CorpusFilters object.
 * Missing parameters are absent on the returned object (not set to undefined).
 */
export function corpusFiltersFromParams(params: URLSearchParams): CorpusFilters {
  const raw: Record<string, string> = {}
  for (const [k, v] of params.entries()) {
    raw[k] = v
  }
  // Parse through the schema to coerce types and drop unknown keys.
  return corpusFiltersSchema.parse(raw)
}

/**
 * Remove a single value from a CSV multi-select filter.
 * If removing the last value the key is omitted from the returned object.
 * Returns a new CorpusFilters — never mutates the input.
 */
export function removeFromFilter(
  filters: CorpusFilters,
  key: MultiFilterKey,
  value: string,
): CorpusFilters {
  const current = filters[key]
  if (!current) return filters
  const remaining = current
    .split(",")
    .filter((v) => v !== value)
    .join(",")
  return { ...filters, [key]: remaining || undefined }
}

/** Return a CorpusFilters with no active selections. */
export function emptyCorpusFilters(): CorpusFilters {
  return {}
}

/** True when at least one filter value is set. */
export function hasActiveFilters(filters: CorpusFilters): boolean {
  return (
    (!!filters.type && filters.type.length > 0) ||
    (!!filters.lang && filters.lang.length > 0) ||
    (!!filters.oa && filters.oa.length > 0) ||
    (!!filters.peer && filters.peer.length > 0) ||
    (!!filters.funder && filters.funder.length > 0) ||
    (!!filters.session && filters.session.length > 0) ||
    filters.yearFrom !== undefined ||
    filters.yearTo !== undefined ||
    filters.undated === true ||
    (!!filters.q && filters.q.length > 0)
  )
}

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

/**
 * Validates an OpenAIRE research-product reference accepted by corpus_add: an
 * OpenAIRE Graph id (contains "::", e.g. `doi_dedup___::<hash>`) OR a DOI (bare
 * `10.x/…` or a doi.org URL). The distinction is resolved server-side — a DOI is
 * canonicalized to its OpenAIRE id before the stub row is inserted. Validation
 * is deliberately loose: the Graph is the authority on what resolves, so we
 * reject only obvious garbage, not plausible identifiers.
 */
export const openaireRefSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (s) =>
      s.includes("::") ||
      /^10\.\d{4,9}\/\S+$/.test(s) ||
      /^https?:\/\/(dx\.)?doi\.org\/10\./i.test(s) ||
      /^doi:10\./i.test(s),
    "must be an OpenAIRE id or a DOI",
  )

// ---------------------------------------------------------------------------
// Corpus mutation inputs
// ---------------------------------------------------------------------------

export const addToCorpusSchema = z.object({
  /** The records to add (OpenAIRE ids or DOIs). Max 5000 per call. */
  ids: z.array(openaireRefSchema).min(1).max(5_000),
  /** Human-readable reason for this mutation (logged as version note). */
  reason: z.string().trim().min(1).max(CORPUS_REASON_MAX_LEN),
})

export type AddToCorpusInput = z.infer<typeof addToCorpusSchema>

export const removeFromCorpusSchema = z.object({
  /** The records to remove (OpenAIRE ids). */
  ids: z.array(z.string().trim().min(1)).min(1).max(5_000),
  /** Human-readable reason for this mutation. */
  reason: z.string().trim().min(1).max(CORPUS_REASON_MAX_LEN),
  /**
   * When true, the removal UI asks the corpus agent to look for other similar
   * cases in the corpus (design: "Ask the agent to find other similar cases").
   * Carried through to the client; the API itself just records it.
   */
  findSimilar: z.boolean().optional(),
})

export type RemoveFromCorpusInput = z.infer<typeof removeFromCorpusSchema>

/**
 * Re-queue background metadata resolution for one or more documents (the detail
 * panel's "retry" affordance + its auto-retry on first paint). Capped low: this
 * is a per-document user action, not a bulk import.
 */
export const retryResolveSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(50),
})

export type RetryResolveInput = z.infer<typeof retryResolveSchema>

// ---------------------------------------------------------------------------
// Diff query params
// ---------------------------------------------------------------------------

export const corpusDiffQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
})

export type CorpusDiffQuery = z.infer<typeof corpusDiffQuerySchema>
