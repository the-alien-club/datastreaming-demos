// models/documents/schema.ts
// Open vocabulary maps for document facets (type, lang) + open-access
// classification. These drive the facet UI and badge rendering.
//
// Vocabularies are "open" — new codes can appear without a schema migration.
// Labels are i18n key suffixes; components use useTranslations("corpus.types")
// and look up by code. Colors are Tailwind utility-class strings.
//
// No imports from other model directories — schema.ts is the foundation layer.

/** One entry in a facet vocabulary map. */
export type VocabEntry = {
  /** i18n key suffix used to look up the display label. */
  label: string
  /** Tailwind class string for the badge: background + text color. */
  color: string
}

// ---------------------------------------------------------------------------
// Background metadata-resolution lifecycle (Document.resolveStatus)
// A freshly-added id is inserted as a "stub" (pending); the drainer resolves
// it via the OpenAIRE MCP (resolved) or marks it failed after the retry ceiling.
// See lib/documents/resolver.ts.
// ---------------------------------------------------------------------------

export const DOCUMENT_RESOLVE_STATUS = {
  PENDING: "pending",
  RESOLVED: "resolved",
  FAILED: "failed",
} as const

export type DocumentResolveStatus =
  (typeof DOCUMENT_RESOLVE_STATUS)[keyof typeof DOCUMENT_RESOLVE_STATUS]

// ---------------------------------------------------------------------------
// Research-product type vocabulary (instanceType / docType column)
// Canonical codes produced by lib/mcp/vocab.ts (mapProductType / mapInstanceType).
// The finer `instanceType` (article/preprint/review/…) is what the type-chip and
// facet cards show; the coarse `docType` (publication/dataset/software/other) is
// the fallback. Both are looked up here.
// Colors follow the prototype (articles indigo, preprints cyan, datasets pink,
// reviews green, software yellow, books orange).
// ---------------------------------------------------------------------------

export const PRODUCT_TYPE: Record<string, VocabEntry> = {
  article: { label: "article", color: "bg-dataset-2/15 text-dataset-2" },
  preprint: { label: "preprint", color: "bg-dataset-3/15 text-dataset-3" },
  dataset: { label: "dataset", color: "bg-dataset-1/15 text-dataset-1" },
  review: { label: "review", color: "bg-dataset-4/15 text-dataset-4" },
  software: { label: "software", color: "bg-dataset-7/15 text-dataset-7" },
  book: { label: "book", color: "bg-dataset-6/15 text-dataset-6" },
  thesis: { label: "thesis", color: "bg-dataset-6/15 text-dataset-6" },
  report: { label: "report", color: "bg-dataset-5/15 text-dataset-5" },
  // Coarse fallbacks (docType) when no instance type mapped.
  publication: { label: "publication", color: "bg-dataset-2/15 text-dataset-2" },
  other: { label: "other", color: "bg-muted text-muted-foreground" },
} as const

// ---------------------------------------------------------------------------
// Language vocabulary (lang column) — ISO 639-1 codes (lib/mcp/vocab.ts).
// Open set: unknown codes are stored as-is. Neutral chip — type carries color.
// ---------------------------------------------------------------------------

const LANG_CHIP = "bg-secondary text-muted-foreground"
export const LANG: Record<string, VocabEntry> = {
  en: { label: "en", color: LANG_CHIP },
  fr: { label: "fr", color: LANG_CHIP },
  de: { label: "de", color: LANG_CHIP },
  es: { label: "es", color: LANG_CHIP },
  it: { label: "it", color: LANG_CHIP },
  pt: { label: "pt", color: LANG_CHIP },
  nl: { label: "nl", color: LANG_CHIP },
  ru: { label: "ru", color: LANG_CHIP },
  ja: { label: "ja", color: LANG_CHIP },
  zh: { label: "zh", color: LANG_CHIP },
  ar: { label: "ar", color: LANG_CHIP },
  la: { label: "la", color: LANG_CHIP },
} as const

// ---------------------------------------------------------------------------
// Open-access classification
// The OpenAIRE Graph splits OA signal across three fields: openAccessColor
// (gold|hybrid|bronze only), the isGreen flag, and bestAccessRight
// (OPEN|EMBARGO|RESTRICTED|CLOSED|UNKNOWN). We collapse them into a single
// Unpaywall-style bucket for the "Access & peer review" breakdown and the OA
// facet. null means UNKNOWN — never silently "closed".
//   gold   — published open in a fully-OA venue
//   hybrid — open in a subscription venue
//   bronze — free to read, no license
//   green  — self-archived open copy (isGreen)
//   closed — bestAccessRight is CLOSED / RESTRICTED / EMBARGO
// ---------------------------------------------------------------------------

export const OPEN_ACCESS_CLASS = {
  GOLD: "gold",
  HYBRID: "hybrid",
  BRONZE: "bronze",
  GREEN: "green",
  CLOSED: "closed",
} as const

export type OpenAccessClass =
  (typeof OPEN_ACCESS_CLASS)[keyof typeof OPEN_ACCESS_CLASS]

/** All OA buckets that count as "open" (for the open-access rate summary). */
export const OPEN_ACCESS_OPEN_CLASSES: readonly OpenAccessClass[] = [
  OPEN_ACCESS_CLASS.GOLD,
  OPEN_ACCESS_CLASS.HYBRID,
  OPEN_ACCESS_CLASS.BRONZE,
  OPEN_ACCESS_CLASS.GREEN,
]

/** Tailwind chip per OA bucket, for the access breakdown rows. */
export const OPEN_ACCESS_COLOR: Record<OpenAccessClass, string> = {
  gold: "bg-dataset-7/15 text-dataset-7",
  hybrid: "bg-dataset-6/15 text-dataset-6",
  bronze: "bg-dataset-5/15 text-dataset-5",
  green: "bg-dataset-4/15 text-dataset-4",
  closed: "bg-muted text-muted-foreground",
}

/**
 * Classify a resolved document's open-access status into a single bucket, or
 * null when unknown. Precedence: explicit color (gold/hybrid/bronze) → green
 * flag → closed (from bestAccessRight) → null.
 */
export function classifyOpenAccess(d: {
  openAccessColor: string | null
  isGreen: boolean | null
  bestAccessRight: string | null
}): OpenAccessClass | null {
  const color = d.openAccessColor?.toLowerCase()
  if (color === "gold") return OPEN_ACCESS_CLASS.GOLD
  if (color === "hybrid") return OPEN_ACCESS_CLASS.HYBRID
  if (color === "bronze") return OPEN_ACCESS_CLASS.BRONZE
  if (d.isGreen === true) return OPEN_ACCESS_CLASS.GREEN
  const right = d.bestAccessRight?.toUpperCase()
  if (right === "OPEN") return OPEN_ACCESS_CLASS.GREEN // open but no color → treat as green route
  if (right === "CLOSED" || right === "RESTRICTED" || right === "EMBARGO") {
    return OPEN_ACCESS_CLASS.CLOSED
  }
  return null
}

/** Whether an OA bucket is "open" (any route). Closed / null are not. */
export function isOpenAccessClass(c: OpenAccessClass | null): boolean {
  return c !== null && c !== OPEN_ACCESS_CLASS.CLOSED
}
