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
import { NullScholexClient, type ScholexClient } from "../openaire/scholex.js";
import { selectPdfCandidates } from "../openaire/select-pdf.js";
import type { OaProduct } from "../openaire/types.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q, type Lane } from "../domain/queues.js";
import type { DocRef, OaMeta, PdfCandidate, ResolvedDoc } from "../domain/types.js";

export interface ResolveOpts {
  /** Route OPEN docs with a candidate PDF through the PDF+OCR fulltext lane (B-M2).
   *  When false (B-M1), every doc goes to prepare via abstract/metadata. Default false. */
  fulltextEnabled?: boolean;
  /** Route docs with a pmc id / DOI through the JATS structured-text lane (preferred
   *  over PDF+OCR). Default false. */
  jatsEnabled?: boolean;
  /** Doc-resolution concurrency (bounded downstream by the rate gate). Default 6. */
  concurrency?: number;
}

/** Pure lane decision from the resolved meta + ranked PDF candidates. "fulltext"
 *  means "attempt full text" (JATS or PDF+OCR); the resolve stage then picks the
 *  concrete lane queue. Exported for tests. */
export function decideLane(
  meta: OaMeta,
  candidates: PdfCandidate[],
  opts: { fulltextEnabled: boolean; jatsEnabled: boolean },
): Lane {
  const jatsEligible = opts.jatsEnabled && (!!meta.pmcid || !!meta.doi);
  const pdfEligible = opts.fulltextEnabled && candidates.length > 0;
  if (jatsEligible || pdfEligible) return "fulltext";
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
  private readonly jatsEnabled: boolean;

  private readonly scholex: ScholexClient;

  constructor(
    deps: StageDeps,
    private readonly oa: OpenAireClient,
    private readonly docState: DocStateStore,
    rate: RateGate | undefined,
    opts: ResolveOpts = {},
    scholex?: ScholexClient,
  ) {
    super(deps);
    this.rate = rate;
    this.fulltextEnabled = opts.fulltextEnabled ?? false;
    this.jatsEnabled = opts.jatsEnabled ?? false;
    this.concurrency = opts.concurrency ?? 6;
    // Citation-link enrichment is optional; a null client yields null counts.
    this.scholex = scholex ?? new NullScholexClient();
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

    // Enrich with ScholeXplorer citation-link counts when the product has a DOI.
    // Best-effort: any failure leaves the counts null and never blocks the doc.
    if (meta.doi) {
      const counts = await this.scholex.relationCounts(meta.doi);
      meta.citedBy = counts.citedBy;
      meta.references = counts.references;
    }

    const candidates = selectPdfCandidates(product);
    const lane = decideLane(meta, candidates, {
      fulltextEnabled: this.fulltextEnabled,
      jatsEnabled: this.jatsEnabled,
    });

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
      // Prefer the JATS structured-text lane when the doc has a pmc id / DOI; else
      // the PDF+OCR lane. The JATS lane falls back to PDF+OCR internally on a miss.
      if (this.jatsEnabled && (meta.pmcid || meta.doi)) {
        await this.queue.send(Q.fetchFulltext, resolved);
        ctx.log.info("resolve_fulltext", {
          id: doc.openaireId,
          lane: "jats",
          pmcid: meta.pmcid ?? null,
        });
        return { kind: "done" };
      }
      await this.queue.send(Q.fetchPdf, resolved);
      ctx.log.info("resolve_fulltext", { id: doc.openaireId, lane: "pdf", candidates: candidates.length });
      return { kind: "done" };
    }

    ctx.log.info("resolve_prepared", { id: doc.openaireId, lane });
    return { kind: "emit", items: [resolved] };
  }
}
