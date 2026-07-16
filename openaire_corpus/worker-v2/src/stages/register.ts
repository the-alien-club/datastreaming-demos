/**
 * Register stage — terminal. Reads the doc's chunks + embeddings + rendered
 * markdown back from S3 and upserts them into the project's data-cluster dataset
 * (the RAG store). On success it records the chunk tally (so the read-model
 * reconciles chunks-written), writes a registration receipt to S3, and flips the
 * doc-state row to `done`.
 *
 * Idempotent via the receipt: a redelivered doc whose receipt already exists just
 * confirms `done` and stops, so it never double-inserts into the cluster.
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { StageContext, StageOutcome } from "../core/types.js";
import type { ClusterSink } from "../ports.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { EmbeddedDoc, PreparedChunk } from "../domain/types.js";
import { failDoc } from "./doc-fail.js";

interface EmbeddingsBlob {
  dim: number;
  vectors: number[][];
}
interface Receipt {
  datasetId: number;
  entryId: number;
}

export class RegisterStage extends PipelineStage<EmbeddedDoc, never> {
  readonly name = "register";
  readonly inputQueue = Q.register;
  override readonly concurrency: number;

  constructor(
    deps: StageDeps,
    private readonly cluster: ClusterSink,
    private readonly docState: DocStateStore,
    opts: { concurrency?: number } = {},
  ) {
    super(deps);
    this.concurrency = opts.concurrency ?? 4;
  }

  async process(doc: EmbeddedDoc, ctx: StageContext): Promise<StageOutcome<never>> {
    const existing = await this.blob.getJson<Receipt>(keys.registered(doc.openaireId));
    if (existing) {
      await this.docState.setStatus(doc.docJobId, "done");
      ctx.log.info("register_dedup", { id: doc.openaireId, entryId: existing.entryId });
      return { kind: "done" };
    }

    const chunks = await this.blob.getJson<PreparedChunk[]>(keys.chunks(doc.openaireId));
    const embeddings = await this.blob.getJson<EmbeddingsBlob>(doc.embeddingsKey);
    const markdownBytes = await this.blob.getBytes(keys.doc(doc.openaireId));
    if (!chunks || !embeddings || !markdownBytes) {
      return failDoc(this.docState, doc.docJobId, "register_missing_artifacts");
    }
    const markdown = markdownBytes.toString("utf8");
    const hasFulltext = doc.lane === "fulltext";
    const original = hasFulltext
      ? await this.pdfOriginal(doc.openaireId, markdown)
      : mdOriginal(markdown);
    const figures = await this.loadFigures(doc);

    try {
      const { datasetId } = await this.cluster.ensureDataset({ projectId: doc.projectId });
      const { entryId } = await this.cluster.upsert({
        datasetId,
        openaireId: doc.openaireId,
        meta: doc.meta,
        lane: doc.lane,
        chunks,
        embeddings: embeddings.vectors,
        original,
        markdown,
        hasFulltext,
        ...(figures.length > 0 ? { figures } : {}),
      });
      await this.blob.putJson(keys.registered(doc.openaireId), { datasetId, entryId } satisfies Receipt);
      // Record chunks-written so the read-model reconciles (chunks tally).
      for (let i = 0; i < chunks.length; i++) {
        await this.docState.recordFolio(doc.docJobId, i, true);
      }
      await this.docState.setStatus(doc.docJobId, "done");
      ctx.log.info("registered", { id: doc.openaireId, datasetId, entryId, chunks: chunks.length });
      return { kind: "done" };
    } catch (e) {
      // The cluster sink is flaky/slow. Retry while attempts remain; on the last
      // attempt mark the doc failed so it reaches a terminal state.
      if (ctx.attempt >= this.retry.attempts) {
        const reason = `register_failed_after_retries: ${e instanceof Error ? e.message : String(e)}`;
        return failDoc(this.docState, doc.docJobId, reason);
      }
      throw e;
    }
  }

  /** Load each figure's bytes from S3 into the upload payload. A figure whose bytes
   *  vanished is skipped (best-effort — a missing figure never blocks the doc). */
  private async loadFigures(
    doc: EmbeddedDoc,
  ): Promise<
    Array<{ id: string; page: number; caption: string; filename: string; bytes: Buffer; contentType: string }>
  > {
    const out: Array<{
      id: string;
      page: number;
      caption: string;
      filename: string;
      bytes: Buffer;
      contentType: string;
    }> = [];
    for (const f of doc.figures ?? []) {
      const bytes = await this.blob.getBytes(keys.figure(doc.openaireId, f.id, f.ext));
      if (!bytes) continue;
      out.push({
        id: f.id,
        page: f.page,
        caption: f.caption,
        filename: `fig-${f.id}.${f.ext}`,
        bytes,
        contentType: f.contentType,
      });
    }
    return out;
  }

  /** The fulltext original is the PDF when present; fall back to the markdown. */
  private async pdfOriginal(
    openaireId: string,
    markdown: string,
  ): Promise<{ filename: string; bytes: Buffer; contentType: string }> {
    const pdf = await this.blob.getBytes(keys.pdf(openaireId));
    if (pdf) return { filename: "document.pdf", bytes: pdf, contentType: "application/pdf" };
    return mdOriginal(markdown);
  }
}

function mdOriginal(markdown: string): { filename: string; bytes: Buffer; contentType: string } {
  return {
    filename: "doc.md",
    bytes: Buffer.from(markdown, "utf8"),
    contentType: "text/markdown; charset=utf-8",
  };
}
