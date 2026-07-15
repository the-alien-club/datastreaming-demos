// lib/mcp/vocab.ts
// Vocabulary mapping tables for the OpenAIRE MCP normalization layer.
// Pure data + pure functions — no server-only import, safe on either side.
// See playbook/mcp-client.md.

/**
 * ISO 639-2/B (3-letter) → ISO 639-1 (2-letter) language code mapping.
 * The OpenAIRE Graph reports `language.code` as a 3-letter code ("eng", "fre").
 * Unknown codes are stored as-is in Document.lang. Extend as observed.
 */
export const LANG3_TO_ISO: Record<string, string> = {
  eng: "en",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  spa: "es",
  ita: "it",
  por: "pt",
  nld: "nl",
  dut: "nl",
  rus: "ru",
  jpn: "ja",
  chi: "zh",
  zho: "zh",
  ara: "ar",
  lat: "la",
}

/**
 * OpenAIRE top-level product `type` → our canonical docType. The Graph returns
 * exactly four values (dnet:result_typologies). Kept 1:1 but named through this
 * table so the rest of the app never hard-codes the raw strings.
 */
export const OA_PRODUCT_TYPE: Record<string, string> = {
  publication: "publication",
  dataset: "dataset",
  software: "software",
  other: "other",
}

/**
 * OpenAIRE instance `type` (dnet:publication_resource label) → the finer
 * display "kind" the UI type-chip and facet cards use. This is the discriminator
 * that tells an Article from a Preprint from a Review — the top-level `type` is
 * always "publication" for all three. Best-effort; unknown labels fall through
 * to the top-level docType at the call site.
 */
export const OA_INSTANCE_TYPE: Record<string, string> = {
  article: "article",
  "research article": "article",
  preprint: "preprint",
  review: "review",
  "conference object": "article",
  "part of book or chapter of book": "book",
  book: "book",
  "doctoral thesis": "thesis",
  "master thesis": "thesis",
  thesis: "thesis",
  report: "report",
  dataset: "dataset",
  software: "software",
}

/**
 * Map the OpenAIRE top-level product type to our canonical docType, defaulting
 * to "other" for absent/unknown values.
 */
export function mapProductType(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim() === "") return "other"
  return OA_PRODUCT_TYPE[raw.trim().toLowerCase()] ?? "other"
}

/**
 * Map an OpenAIRE instance-type label to the finer display kind, or null when
 * the label is absent/unknown (caller falls back to docType).
 */
export function mapInstanceType(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null
  return OA_INSTANCE_TYPE[raw.trim().toLowerCase()] ?? null
}

/** Map a 3-letter Graph language code to ISO 639-1, preserving unknowns. */
export function mapLang(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null
  const code = raw.trim().toLowerCase()
  return LANG3_TO_ISO[code] ?? code
}

/**
 * Normalize an OpenAIRE id by stripping the entity-type prefix ("50|…::hash" →
 * "…::hash"). The Graph `get` endpoint rejects the prefixed form (HTTP 404) and
 * the Document PK stores the bare form. Idempotent on already-bare ids.
 */
export function stripEntityPrefix(id: string): string {
  const bar = id.indexOf("|")
  return bar >= 0 ? id.slice(bar + 1) : id
}

/**
 * Normalize a DOI to its bare form: lowercase, no `https://doi.org/` /
 * `doi:` prefix, no surrounding whitespace. Returns null for empty input.
 * DOIs are case-insensitive; lowercasing gives a stable dedup key.
 */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  let s = raw.trim().toLowerCase()
  if (s === "") return null
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
  s = s.replace(/^doi:/, "")
  return s.startsWith("10.") ? s : null
}

/**
 * Heuristic: is a string an OpenAIRE Graph id (as opposed to a DOI)? Graph ids
 * carry a namespace separator `::` (e.g. `doi_dedup___::<hash>`); DOIs never do.
 * Used by corpus_add to route an input to id-dereference vs DOI-resolution.
 */
export function looksLikeOpenaireId(s: string): boolean {
  return s.includes("::")
}
