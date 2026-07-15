// models/corpus/schema.ts
// Domain constants, named query shapes, and derived types for the corpus model.
// No imports from other model directories — schema.ts is the foundation layer.
// See playbook/models.md import diagram.

import { Prisma } from "@/lib/generated/prisma/client"

// ---------------------------------------------------------------------------
// Domain status enum
// ---------------------------------------------------------------------------

export const CORPUS_VERSION_STATUS = {
  DRAFT: "draft",
  SEALED: "sealed",
  INGESTED: "ingested",
  FAILED: "failed",
} as const

export type CorpusVersionStatus =
  (typeof CORPUS_VERSION_STATUS)[keyof typeof CORPUS_VERSION_STATUS]

// ---------------------------------------------------------------------------
// Named Prisma query shapes
// ---------------------------------------------------------------------------

/**
 * CorpusVersion with its membership ids (no Document join).
 * Used by advanceVersion() to read existing membership and by services that
 * need to know which documents belong to a version without the full row.
 */
export const corpusVersionWithIds = {
  include: { membership: { select: { openaireId: true } } },
} satisfies Prisma.CorpusVersionDefaultArgs

export type CorpusVersionWithIds = Prisma.CorpusVersionGetPayload<
  typeof corpusVersionWithIds
>

/**
 * Minimal document projection returned to the comprehension panel and detail
 * side-sheet. Full raw metadata is served separately by doc_get.
 */
export const documentRow = {
  select: {
    openaireId: true,
    doi: true,
    title: true,
    author: true,
    year: true,
    dateLabel: true,
    docType: true,
    instanceType: true,
    lang: true,
    publisher: true,
    venue: true,
    abstract: true,
    openAccessColor: true,
    isGreen: true,
    bestAccessRight: true,
    peerReviewed: true,
    citationCount: true,
    citedByCount: true,
    referencesCount: true,
    relatedCount: true,
    fulltextUrl: true,
    sourceRepoUrl: true,
    funder: true,
    // Resolution lifecycle: "pending" rows render a placeholder until their MCP
    // metadata lands; "failed" rows surface a resolution-error affordance.
    resolveStatus: true,
  },
} satisfies Prisma.DocumentDefaultArgs

export type DocumentRow = Prisma.DocumentGetPayload<typeof documentRow>

// ---------------------------------------------------------------------------
// Composite types returned to the API layer
// ---------------------------------------------------------------------------

/**
 * The shape returned for the corpus comprehension panel (Constituer step).
 *
 * IMPORTANT: `sample` is bounded (CORPUS_SAMPLE_SIZE items). Never use
 * `sample.length` as a proxy for the corpus size — use `total` instead.
 * See playbook/corpus-versioning.md §"Sample is sampled".
 *
 * `total` — count of documents matching the active filters (or the full
 * corpus when no filters are set). `total === 0` means:
 *   • no filters active → fresh project with zero documents
 *   • filters active    → the filter matches nothing ("no results" branch)
 *
 * `undatedCount` — count of RESOLVED documents with `year IS NULL` within the
 * filtered set. Informational; drives the "Période non datée (N)" tile.
 * Pending/failed stubs are excluded (their date is unknown, not absent).
 *
 * `pendingCount` / `failedCount` — documents whose OpenAIRE metadata is still
 * resolving in the background, or whose resolution exhausted its retries. These
 * are real corpus members (counted in `total`) but carry no type/lang/period
 * yet, so they are excluded from the facet records and surfaced separately by
 * the UI (a dedicated "resolving" bucket / tile) rather than polluting the real
 * distributions.
 *
 * `nextCursor` — opaque pagination cursor. Present when more documents exist
 * beyond the current `sample` page. Pass as `?cursor=` on the next request.
 * Format: `<versionSeq>:<lastOpenaireId>` (stable for the same version + filters).
 */
export type CorpusSnapshot = {
  versionSeq: number
  versionStatus: CorpusVersionStatus
  total: number
  undatedCount: number
  /** Members still resolving metadata in the background (counted in `total`). */
  pendingCount: number
  /** Members whose metadata resolution exhausted its retries. */
  failedCount: number
  facets: {
    /** By research-product display type (article/preprint/dataset/…). */
    type: Record<string, number>
    lang: Record<string, number>
    /** By open-access bucket (gold/hybrid/bronze/green/closed). */
    oa: Record<string, number>
    /** Per-decade buckets, e.g. "2010s", "2020s". Nulls are skipped. */
    period: Record<string, number>
  }
  /**
   * Per-session attribution facet: how many documents in the current filtered
   * head set each AppSession contributed. A document contributed by several
   * sessions is counted once under each (multi-session attribution). Carries the
   * session `title` so the UI can label the facet/chip without a second lookup.
   * Sorted by `count` descending.
   */
  sessions: { sessionId: string; title: string; count: number }[]
  /**
   * Access & peer-review breakdown — the ingestability picture for the
   * comprehension panel and the four summary cards. Computed over RESOLVED
   * documents only (OA/abstract/peer-review is unknown for stubs), so `resolved`
   * is the denominator for the "X / Y" rates. `openAccess` sub-buckets are
   * mutually exclusive; `open` is their sum. See classifyOpenAccess().
   */
  access: {
    /** Resolved documents classified here (the rate denominator). */
    resolved: number
    /** Resolved documents in any open bucket (gold+hybrid+bronze+green). */
    open: number
    /** Resolved documents with an abstract (indexed on full metadata + text). */
    withAbstract: number
    /** Resolved documents flagged peer-reviewed. */
    peerReviewed: number
    /** Per open-access bucket (gold/hybrid/bronze/green/closed). Sums to resolved. */
    openAccess: Record<string, number>
  }
  sample: DocumentRow[]
  nextCursor?: string
}

/**
 * A flat, cursor-paginated page of corpus documents — the result of
 * `CorpusQueries.list()`. Unlike `CorpusSnapshot` it computes NO facets (it is
 * the cheap exhaustive-listing path); `total` is the count within the active
 * filters, `documents` is one keyset page, and `nextCursor` is present iff more
 * pages exist. The agent tool may trim `documents` to a requested field subset
 * for token economy — that projection happens at the tool boundary, not here.
 */
export type CorpusListPage = {
  versionSeq: number
  total: number
  documents: DocumentRow[]
  nextCursor?: string
}

/**
 * The two dimensions a cross-facet tabulates. `period` is the derived decade
 * bucket (e.g. "2010s") and `oa` the derived open-access bucket; `type` and
 * `lang` are stored columns. All dims are computed over RESOLVED documents only
 * (the dimensions are unknown for stubs).
 */
export type CorpusFacetDimension = "period" | "type" | "lang" | "oa"

/**
 * A crossed-facet table — the result of `CorpusQueries.crossFacets()`. `cells`
 * is sparse (only non-zero combinations), sorted by `count` descending, so
 * "1970s × book = 10" is the kind of single-call insight the corpus agent needs
 * to locate a sub-population without probing ARKs one by one.
 */
export type CorpusCrossFacets = {
  dims: [CorpusFacetDimension, CorpusFacetDimension]
  cells: { a: string; b: string; count: number }[]
}

/**
 * Delta between two corpus versions: which ids were added and which removed.
 * Computed in CorpusQueries.diff(); never client-side (sample is sampled).
 */
export type CorpusDiff = {
  fromSeq: number
  toSeq: number
  added: string[]
  removed: string[]
  addedCount: number
  removedCount: number
}
