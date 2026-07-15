/**
 * Resolve stage — the head of the pipeline and the lane router.
 *
 *   DocRef → OpenAIRE Graph API getById → normalise OaMeta → decide lane:
 *     fulltext → an OPEN instance with a candidate PDF url (B-M2: route to fetchPdf)
 *     abstract → the product has an abstract → straight to prepare
 *     metadata → no full text, no abstract → index a formatted metadata record
 *
 * B-M1: full text is disabled (the `fulltextEnabled` flag defaults off), so every
 * doc routes to prepare via the abstract/metadata lane and no PDF is fetched. The
 * fulltext branch is wired (select-pdf + the fetchPdf hand-off) but only taken when
 * B-M2 flips the flag.
 *
 * Does NOT use the outcome cache (artifactKey=null): it has side effects (upsertDoc,
 * recordPlan) that must re-run idempotently on a redelivery. The resolved metadata
 * JSON is persisted to S3 for reuse.
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { RateGate, StageContext, StageOutcome } from "../core/types.js";
import type { OpenAireClient } from "../openaire/client.js";
import { PermanentOpenAireError } from "../openaire/errors.js";
import { toMeta } from "../openaire/map.js";
import { selectPdfCandidates } from "../openaire/select-pdf.js";
import type { OaProduct } from "../openaire/types.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q, type Lane } from "../domain/queues.js";
import type { DocRef, OaMeta, PdfCandidate, ResolvedDoc } from "../domain/types.js";

export interface ResolveOpts {
  /** Route OPEN docs with a candidate PDF through the fulltext lane (B-M2). When
   *  false (B-M1), every doc goes to prepare via abstract/metadata. Default false. */
  fulltextEnabled?: boolean;
  /** Doc-resolution concurrency (bounded downstream by the rate gate). Default 6. */
  concurrency?: number;
}

/** Pure lane decision from the resolved meta + ranked PDF candidates. Exported for tests. */
export function decideLane(
  meta: OaMeta,
  candidates: PdfCandidate[],
  fulltextEnabled: boolean,
): Lane {
  if (fulltextEnabled && candidates.length > 0) return "fulltext";
  if (meta.abstract && meta.abstract.trim().length > 0) return "abstract";
  return "metadata";
}

export class ResolveStage extends PipelineStage<DocRef, ResolvedDoc> {
  readonly name = "resolve";
  readonly inputQueue = Q.resolve;
  override readonly outputQueue = Q.prepare;
  override readonly concurrency: number;
  override readonly rate?: RateGate;

  private readonly fulltextEnabled: boolean;

  constructor(
    deps: StageDeps,
    private readonly oa: OpenAireClient,
    private readonly docState: DocStateStore,
    rate: RateGate | undefined,
    opts: ResolveOpts = {},
  ) {
    super(deps);
    this.rate = rate;
    this.fulltextEnabled = opts.fulltextEnabled ?? false;
    this.concurrency = opts.concurrency ?? 6;
  }

  async process(doc: DocRef, ctx: StageContext): Promise<StageOutcome<ResolvedDoc>> {
    await this.docState.upsertDoc(doc);

    let product: OaProduct;
    try {
      const cached = await this.blob.getJson<OaProduct>(keys.meta(doc.openaireId));
      product = cached ?? (await this.oa.getById(doc.openaireId));
      if (!cached) await this.blob.putJson(keys.meta(doc.openaireId), product);
    } catch (e) {
      if (e instanceof PermanentOpenAireError) {
        const reason = e.cause === "not_found" ? "not_found" : "unresolvable";
        await this.docState.setStatus(doc.docJobId, "skipped", { skipReason: reason });
        return { kind: "skip", reason };
      }
      // Transient: retry while attempts remain; on the LAST attempt mark the doc
      // failed so it reaches a terminal state rather than orphaning in 'queued'.
      if (ctx.attempt >= this.retry.attempts) {
        const reason = `resolve_unavailable_after_retries: ${e instanceof Error ? e.message : String(e)}`;
        await this.docState.setStatus(doc.docJobId, "failed", { error: reason });
        return { kind: "fail", reason, terminal: true };
      }
      throw e;
    }

    const meta = toMeta(product, doc.doi);
    const candidates = selectPdfCandidates(product);
    const lane = decideLane(meta, candidates, this.fulltextEnabled);

    // pagesExpected is finalised at register (chunk count); seed a plan so the doc
    // leaves 'queued' and the read-model reconciles. 1 is the abstract/metadata
    // floor; the fulltext lane refines it after extract.
    await this.docState.recordPlan(doc.docJobId, { lane, pagesExpected: 1, meta });

    const resolved: ResolvedDoc = {
      projectId: doc.projectId,
      docJobId: doc.docJobId,
      openaireId: doc.openaireId,
      doi: meta.doi,
      ...(doc.runId !== undefined ? { runId: doc.runId } : {}),
      lane,
      meta,
      ...(candidates.length > 0 ? { pdfCandidates: candidates } : {}),
    };

    if (lane === "fulltext") {
      await this.queue.send(Q.fetchPdf, resolved);
      ctx.log.info("resolve_fulltext", { id: doc.openaireId, candidates: candidates.length });
      return { kind: "done" };
    }

    ctx.log.info("resolve_prepared", { id: doc.openaireId, lane });
    return { kind: "emit", items: [resolved] };
  }
}
