/**
 * S3 key scheme — deterministic, content-addressed by OpenAIRE id (+ content hash
 * where the payload varies). The presence of a key is the idempotency/resume
 * signal: a stage whose artifact key exists skips its external call. Heavy bytes
 * (PDF) and the small per-stage outcome pointers both live here under distinct
 * prefixes.
 *
 * `slug` is the OpenAIRE id with the API's `::`/`|` separators normalised so keys
 * are flat and filesystem/S3-safe (a bare id looks like `doi_dedup___<hash>`).
 */
export function oaSlug(openaireId: string): string {
  return openaireId.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export const keys = {
  /** Resolved product metadata JSON. */
  meta: (id: string) => `meta/${oaSlug(id)}.json`,
  /** The downloaded full-text PDF bytes (fulltext lane only). */
  pdf: (id: string) => `pdf/${oaSlug(id)}.pdf`,
  /** Extracted per-page text (content-hashed on the pdf bytes). */
  pages: (id: string, sha8: string) => `pages/${oaSlug(id)}.${sha8}.json`,
  /** Prepared index chunks (read back by register). */
  chunks: (id: string) => `chunks/${oaSlug(id)}.json`,
  /** Rendered doc markdown (the entry's original/processed artifact). */
  doc: (id: string) => `doc/${oaSlug(id)}.md`,
  /** A figure image extracted from the PDF (fulltext lane). `figId` = "f1"…,
   *  `ext` = "jpeg"|"png". Written by extract, read + uploaded by register. */
  figure: (id: string, figId: string, ext: string) => `figures/${oaSlug(id)}/${figId}.${ext}`,
  /** Embeddings for a doc (content-hashed on the chunk set). */
  embeddings: (id: string, sha8: string) => `embed/${oaSlug(id)}.${sha8}.json`,
  /** Terminal registration receipt — its presence means the doc is fully ingested. */
  registered: (id: string) => `registered/${oaSlug(id)}.json`,

  /** Per-stage OUTCOME cache (the small emit/done envelope the base persists). */
  outcome: (stage: string, id: string) => `outcome/${stage}/${oaSlug(id)}.json`,
};
