/**
 * External-service ports — the narrow seams between the pipeline stages and the
 * heavy third-party clients (RunPod embeddings, the data-cluster sink). Every stage
 * depends ONLY on these interfaces, so the dataflow is unit-testable end to end with
 * in-memory fakes, and the live clients (ported/vendored from V1) are the only code
 * that does I/O.
 *
 * The OpenAIRE seam lives in ./openaire/client.ts (OpenAireClient); these are the
 * downstream ports. All methods throw on hard failure — the stage base coerces a
 * throw into a non-terminal fail (→ retry); a stage maps a known-terminal condition
 * to a terminal fail itself.
 */
import type { OaMeta, PreparedChunk } from "./domain/types.js";

/** Why a PDF fetch failed — drives the degrade-to-abstract decision + logging. */
export type PdfFetchFailure =
  | "paywalled"
  | "not_found"
  | "html_not_pdf"
  | "too_large"
  | "timeout"
  | "bad_pdf"
  | "no_candidate_url";

export type PdfFetchResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; failure: PdfFetchFailure; detail?: string };

/** Downloads + validates a PDF from a candidate url. All politeness/timeout/size
 *  limits live in the implementation; the stage only decides lane routing. */
export interface PdfFetcher {
  fetch(input: { url: string; host: string }): Promise<PdfFetchResult>;
}

/** Extracts per-page text from PDF bytes. Throws on a corrupt/unreadable PDF. */
export interface PdfTextExtractor {
  extract(bytes: Buffer, opts: { maxPages: number }): Promise<{ pages: string[] }>;
}

/** RunPod (or any) embedder — vectors for a doc's chunk texts. */
export interface Embedder {
  /** Embed N texts → N vectors (same order). */
  embed(texts: string[]): Promise<number[][]>;
  readonly dim: number;
}

/** The data-cluster sink — ensure the project dataset, then upsert the doc. */
export interface ClusterSink {
  ensureDataset(input: { projectId: string }): Promise<{ datasetId: number }>;
  upsert(input: {
    datasetId: number;
    openaireId: string;
    meta: OaMeta;
    lane: string;
    chunks: PreparedChunk[];
    embeddings: number[][];
    /** The original artifact (doc.md, or the PDF for fulltext) — bytes + filename. */
    original: { filename: string; bytes: Buffer; contentType: string };
    /** Markdown rendering of the doc, stored as `processed` content. */
    markdown: string;
    hasFulltext: boolean;
  }): Promise<{ entryId: number }>;
}
