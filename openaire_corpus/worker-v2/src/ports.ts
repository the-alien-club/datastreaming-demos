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

/** A figure extracted from a PDF (Mistral OCR image crop). Bytes ride in-process
 *  from the extractor to the extract stage, which persists them to S3; only a
 *  lightweight descriptor (domain FigureRef) travels the queue afterwards. */
export interface ExtractedFigure {
  /** Stable per-doc id in reading order — "f1", "f2", … The citation key half of
   *  `![[openaireId|caption|figureId]]`. */
  id: string;
  /** 1-based PDF page the figure appears on. */
  page: number;
  /** Decoded image bytes. */
  bytes: Buffer;
  /** MIME type ("image/jpeg" | "image/png"). */
  contentType: string;
  /** Caption/description (Mistral `image_annotation` when present, else ""). The
   *  surrounding caption prose also stays in the page markdown, so search is
   *  unaffected when this is empty. */
  caption: string;
}

/** Extracts per-page text (+ figures) from PDF bytes. Throws on an unreadable PDF. */
export interface PdfTextExtractor {
  extract(
    bytes: Buffer,
    opts: { maxPages: number },
  ): Promise<{ pages: string[]; figures: ExtractedFigure[] }>;
}

/** Fetches clean JATS full-text XML for a document (the structured-text lane).
 *  Returns the raw XML string, or null when this source has no full text for the
 *  doc (→ the fetch-fulltext stage falls through to the next tier). Never throws for
 *  a plain "not available"; may throw on a transient network error (→ retry). */
export interface JatsSource {
  /** Europe PMC: by PMC id ("PMC7250577"). */
  fetchByPmcid?(pmcid: string): Promise<string | null>;
  /** Publisher JATS (eLife/PLOS…): by DOI. */
  fetchByDoi?(doi: string): Promise<string | null>;
}

/** Resolves a direct OA PDF url for a DOI (Unpaywall). Null when none is known.
 *  The fetch-fulltext stage hands the url to the existing PDF+OCR lane. */
export interface OaPdfLocator {
  findPdfUrl(doi: string): Promise<string | null>;
}

/** Fetches a figure's image bytes for a PMC article (the OA `/bin/` path). Returns
 *  null when the image isn't openly available (→ that figure is skipped). */
export interface FigureImageFetcher {
  fetch(input: {
    pmcid: string;
    href: string;
  }): Promise<{ bytes: Buffer; contentType: string } | null>;
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
    /** Figure images to attach to the entry (fulltext lane). Each is uploaded as a
     *  `processed` file named `filename`; the id/caption/page are recorded in the
     *  entry metadata's `figures[]` so the app can resolve `![[…|…|figureId]]`. */
    figures?: Array<{
      id: string;
      page: number;
      caption: string;
      filename: string;
      bytes: Buffer;
      contentType: string;
    }>;
  }): Promise<{ entryId: number }>;
}
