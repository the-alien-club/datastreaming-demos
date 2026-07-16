/**
 * The concrete payloads that flow between stages. Each is a small JSON pointer —
 * heavy bytes (PDF, page texts, embeddings) live in S3 (see keys.ts), never on the
 * queue. Field names are stable: these ARE the inter-stage contracts.
 */
import type { Lane } from "./queues.js";

/** Seed item: a document to ingest. Enters the resolve stage. */
export interface DocRef {
  projectId: string;
  docJobId: string; // the document_ingest_job_v2 row id (per-doc state lives there)
  openaireId: string;
  /** DOI carried from the app's delta (may be re-derived from pids at resolve). */
  doi: string | null;
  /** The ingest_run this doc belongs to. Null for seed-CLI docs (no run/callback);
   *  set for every doc admitted through the HTTP ingress so the completion detector
   *  and the read-model can scope per run. Flows through every downstream payload. */
  runId?: string | null;
}

/** Normalised metadata for a resolved product — the citation/context record. */
export interface OaMeta {
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  publisher: string | null;
  type: string;
  doi: string | null;
  bestAccessRight: string | null;
  openAccessColor: string | null;
  license?: string | null;
  /** FOS-cleaned subject labels (see openaire/fos.ts). */
  subjects: string[];
  /** Raw citation count from the Graph indicators (BipIndicators). Null = unknown. */
  citationCount?: number | null;
  /** ScholeXplorer link counts (enrichment; null when unavailable / DOI-less). */
  citedBy?: number | null;
  references?: number | null;
}

/** A candidate full-text PDF url, ranked by select-pdf (B-M2). */
export interface PdfCandidate {
  url: string;
  host: string;
  license: string | null;
}

/** Resolve → prepare (abstract/metadata) or resolve → fetchPdf (fulltext). */
export interface ResolvedDoc extends DocRef {
  lane: Lane;
  meta: OaMeta;
  /** Ranked candidate PDFs for the fulltext lane (empty/undefined otherwise). */
  pdfCandidates?: PdfCandidate[];
  /** Extracted per-page text (fulltext lane, set by the extract stage — B-M2).
   *  When present, prepare builds page chunks from these instead of the abstract. */
  pageTexts?: string[];
}

/** Where a chunk came from — the citation locator. */
export type ChunkLocator =
  | { kind: "abstract" }
  | { kind: "metadata" }
  | { kind: "page"; page: number; part?: number };

export interface PreparedChunk {
  index: number;
  text: string;
  locator: ChunkLocator;
}

/** A doc with its prepared chunks — feeds embed. */
export interface PreparedDoc extends DocRef {
  lane: Lane;
  meta: OaMeta;
  chunks: PreparedChunk[];
}

/** A doc whose chunks are embedded — feeds register. */
export interface EmbeddedDoc extends DocRef {
  lane: Lane;
  meta: OaMeta;
  /** S3 key where the embeddings landed (heavy → not inlined). */
  embeddingsKey: string;
  chunkCount: number;
}
