/**
 * Queue (bucket) names + the lane vocabulary. One queue == one stage's input.
 *
 * OpenAIRE topology (linear per-doc, no folio fan-out, no Monitor fan-in):
 *
 *   resolve → [fulltext lane] fetchPdf → extract → prepare → embed → register
 *           → [abstract/metadata lanes]            → prepare → embed → register
 *
 * The resolve stage decides each doc's lane from its access rights + candidate PDF
 * urls; abstract/metadata docs skip fetchPdf/extract and go straight to prepare.
 */
export const Q = {
  resolve: "v2.resolve",
  /** JATS structured-text lane (Europe PMC / publisher / Unpaywall cascade). */
  fetchFulltext: "v2.fetchfulltext",
  fetchPdf: "v2.fetchpdf",
  extract: "v2.extract",
  prepare: "v2.prepare",
  embed: "v2.embed",
  register: "v2.register",
} as const;

export type QueueName = (typeof Q)[keyof typeof Q];

/**
 * A document's processing lane, decided by the resolve stage:
 *   - fulltext → an OPEN instance with a candidate PDF url (fetch + extract text)
 *   - abstract → no fetchable full text, but the product has an abstract
 *   - metadata → no full text and no abstract (index a formatted metadata record)
 */
export type Lane = "fulltext" | "abstract" | "metadata";
