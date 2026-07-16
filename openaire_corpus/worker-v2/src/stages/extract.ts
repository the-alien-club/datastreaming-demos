/**
 * Extract stage — fulltext lane. Reads the downloaded PDF from S3 and OCRs it via
 * the injected extractor (Mistral OCR — it handles scanned and born-digital PDFs
 * alike), then decides whether OCR produced usable text:
 *   - no non-empty pages, or median chars/page < ~100 → OCR returned effectively
 *     nothing (failed / blank). The doc DEGRADES to the abstract/metadata lane
 *     (re-emitted to prepare) so full text is simply skipped, never invented.
 *   - otherwise → emit a ResolvedDoc carrying `pageTexts` (per-page markdown) to
 *     prepare, which builds the page chunks.
 *
 * A failed OCR call (extractor throws, after its own retries) also degrades — the
 * doc is never dropped.
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { StageContext, StageOutcome } from "../core/types.js";
import type { PdfTextExtractor } from "../ports.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { FigureRef, ResolvedDoc } from "../domain/types.js";
import type { ExtractedFigure } from "../ports.js";

/** File extension for a figure's MIME type (data-cluster filename suffix). */
function extForContentType(contentType: string): string {
  const sub = contentType.split("/")[1]?.toLowerCase() ?? "jpeg";
  if (sub === "jpg") return "jpeg";
  return sub.replace(/[^a-z0-9]/g, "") || "jpeg";
}

/** Median chars/page below this → OCR returned effectively nothing; degrade. */
const MIN_MEDIAN_CHARS_PER_PAGE = 100;

/** Median of a numeric list (0 for empty). Exported for tests. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface ExtractOpts {
  concurrency?: number;
  maxPages?: number;
}

export class ExtractStage extends PipelineStage<ResolvedDoc, ResolvedDoc> {
  readonly name = "extract";
  readonly inputQueue = Q.extract;
  override readonly outputQueue = Q.prepare;
  override readonly concurrency: number;

  private readonly maxPages: number;

  constructor(
    deps: StageDeps,
    private readonly extractor: PdfTextExtractor,
    private readonly docState: DocStateStore,
    opts: ExtractOpts = {},
  ) {
    super(deps);
    this.concurrency = opts.concurrency ?? 4;
    this.maxPages = opts.maxPages ?? 500;
  }

  protected override async onExhausted(doc: ResolvedDoc, reason: string): Promise<void> {
    await this.degrade(doc, `extract_exhausted: ${reason}`);
  }

  async process(doc: ResolvedDoc, ctx: StageContext): Promise<StageOutcome<ResolvedDoc>> {
    const bytes = await this.blob.getBytes(keys.pdf(doc.openaireId));
    if (!bytes) {
      // The PDF vanished (shouldn't happen post-fetch) — degrade rather than hang.
      await this.degrade(doc, "extract_missing_pdf");
      return { kind: "done" };
    }

    let pages: string[];
    let rawFigures: ExtractedFigure[];
    try {
      ({ pages, figures: rawFigures } = await this.extractor.extract(bytes, {
        maxPages: this.maxPages,
      }));
    } catch (e) {
      ctx.log.warn("extract_failed", { id: doc.openaireId, error: e instanceof Error ? e.message : String(e) });
      await this.degrade(doc, "extract_parse_error");
      return { kind: "done" };
    }

    const nonEmpty = pages.filter((p) => p.trim().length > 0);
    const med = median(pages.map((p) => p.trim().length));
    if (nonEmpty.length === 0 || med < MIN_MEDIAN_CHARS_PER_PAGE) {
      ctx.log.warn("extract_ocr_empty", { id: doc.openaireId, medianChars: med });
      await this.degrade(doc, "ocr_empty_or_failed");
      return { kind: "done" };
    }

    // Persist each figure's bytes to S3; the register stage reads them back and
    // uploads them to the data-cluster entry. Only the lightweight FigureRef
    // descriptor travels the queue.
    const figures: FigureRef[] = [];
    for (const f of rawFigures) {
      const ext = extForContentType(f.contentType);
      await this.blob.putBytes(keys.figure(doc.openaireId, f.id, ext), f.bytes, f.contentType);
      figures.push({ id: f.id, page: f.page, contentType: f.contentType, caption: f.caption, ext });
    }

    ctx.log.info("extracted", {
      id: doc.openaireId,
      pages: pages.length,
      medianChars: med,
      figures: figures.length,
    });
    const withText: ResolvedDoc = {
      projectId: doc.projectId,
      docJobId: doc.docJobId,
      openaireId: doc.openaireId,
      doi: doc.doi,
      ...(doc.runId !== undefined ? { runId: doc.runId } : {}),
      lane: "fulltext",
      meta: doc.meta,
      pageTexts: pages,
      ...(figures.length > 0 ? { figures } : {}),
    };
    return { kind: "emit", items: [withText] };
  }

  private async degrade(doc: ResolvedDoc, reason: string): Promise<void> {
    const lane = doc.meta.abstract && doc.meta.abstract.trim().length > 0 ? "abstract" : "metadata";
    await this.docState.recordPlan(doc.docJobId, { lane, pagesExpected: 1, meta: doc.meta });
    const degraded: ResolvedDoc = {
      projectId: doc.projectId,
      docJobId: doc.docJobId,
      openaireId: doc.openaireId,
      doi: doc.doi,
      ...(doc.runId !== undefined ? { runId: doc.runId } : {}),
      lane,
      meta: doc.meta,
    };
    await this.queue.send(Q.prepare, degraded);
    void reason;
  }
}
