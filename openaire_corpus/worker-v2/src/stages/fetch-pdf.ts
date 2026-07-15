/**
 * FetchPdf stage — fulltext lane. Downloads the best candidate PDF (trying the
 * ranked list in order via the PdfFetcher), stores the bytes at keys.pdf, and emits
 * the doc to the extract queue. If NO candidate yields a valid PDF, the doc DEGRADES
 * to the abstract/metadata lane (re-emitted to prepare with its lane recomputed) —
 * it is never dropped; the full text simply isn't available.
 *
 * Idempotency/resume comes from the bytes in S3 (skip the download on a hit), not
 * the base outcome cache (whose replayed payload would carry a prior job's identity
 * on a re-ingest).
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { StageContext, StageOutcome } from "../core/types.js";
import type { PdfFetcher } from "../ports.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { ResolvedDoc } from "../domain/types.js";

export class FetchPdfStage extends PipelineStage<ResolvedDoc, ResolvedDoc> {
  readonly name = "fetchPdf";
  readonly inputQueue = Q.fetchPdf;
  override readonly outputQueue = Q.extract;
  override readonly concurrency: number;

  constructor(
    deps: StageDeps,
    private readonly fetcher: PdfFetcher,
    private readonly docState: DocStateStore,
    opts: { concurrency?: number } = {},
  ) {
    super(deps);
    this.concurrency = opts.concurrency ?? 8;
  }

  protected override async onExhausted(doc: ResolvedDoc, reason: string): Promise<void> {
    // A thrown fetch error that exhausts retries must still terminate the doc — but
    // the fulltext path always degrades rather than fails, so degrade here too.
    await this.degrade(doc, `fetchpdf_exhausted: ${reason}`);
  }

  async process(doc: ResolvedDoc, ctx: StageContext): Promise<StageOutcome<ResolvedDoc>> {
    // Resume: bytes already downloaded → straight to extract.
    if (await this.blob.has(keys.pdf(doc.openaireId))) {
      ctx.log.info("fetchpdf_cache_hit", { id: doc.openaireId });
      return { kind: "emit", items: [doc] };
    }

    const candidates = doc.pdfCandidates ?? [];
    if (candidates.length === 0) {
      return this.degradeOutcome(doc, "no_candidate_url", ctx);
    }

    const failures: string[] = [];
    for (const cand of candidates) {
      const res = await this.fetcher.fetch({ url: cand.url, host: cand.host });
      if (res.ok) {
        await this.blob.putBytes(keys.pdf(doc.openaireId), res.bytes, "application/pdf");
        ctx.log.info("fetchpdf_ok", { id: doc.openaireId, host: cand.host, bytes: res.bytes.length });
        return { kind: "emit", items: [doc] };
      }
      failures.push(`${cand.host}:${res.failure}`);
    }

    // Every candidate failed → degrade to abstract/metadata (never drop).
    return this.degradeOutcome(doc, failures.join(","), ctx);
  }

  /** Re-route the doc to prepare on the abstract/metadata lane. */
  private degradeOutcome(
    doc: ResolvedDoc,
    reason: string,
    ctx: StageContext,
  ): StageOutcome<ResolvedDoc> {
    ctx.log.warn("fetchpdf_degrade", { id: doc.openaireId, reason });
    void this.degrade(doc, reason);
    return { kind: "done" }; // we sent to prepare ourselves (different queue)
  }

  private async degrade(doc: ResolvedDoc, reason: string): Promise<void> {
    const lane = doc.meta.abstract && doc.meta.abstract.trim().length > 0 ? "abstract" : "metadata";
    await this.docState.recordPlan(doc.docJobId, {
      lane,
      pagesExpected: 1,
      meta: doc.meta,
    });
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
