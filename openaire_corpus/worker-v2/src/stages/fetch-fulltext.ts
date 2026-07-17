/**
 * FetchFulltext stage — the structured-text lane and the head of the source
 * cascade. For a doc routed here (jatsEnabled + a pmc id or DOI), it tries, in
 * order:
 *   Tier 1  Europe PMC JATS (by pmc id)   → clean sections, no OCR
 *   Tier 2  publisher JATS (eLife/PLOS)   → clean sections, no OCR
 *   Tier 4  Unpaywall → an OA PDF url     → hand to the PDF+OCR lane (fetchPdf)
 *   else    existing pdfCandidates present → hand to the PDF+OCR lane (fetchPdf)
 *   else    degrade to abstract/metadata (prepare)
 *
 * On a JATS hit it parses to sections (+ figures), fetches PMC figure images when
 * available, persists the XML + figure bytes to S3, and emits a ResolvedDoc with
 * `sections` to prepare (which builds section chunks). A per-doc failure never fails
 * the job — the doc always reaches a lane (JATS → PDF → abstract), never dropped.
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { StageContext, StageOutcome } from "../core/types.js";
import type { FigureImageFetcher, JatsSource, OaPdfLocator } from "../ports.js";
import { parseJats, type ParsedJats } from "../live/jats-parser.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { DocSection, FigureRef, PdfCandidate, ResolvedDoc } from "../domain/types.js";

/** File extension for a figure's MIME type (data-cluster filename suffix). */
function extForContentType(contentType: string): string {
  const sub = contentType.split("/")[1]?.toLowerCase() ?? "jpeg";
  if (sub === "jpg") return "jpeg";
  return sub.replace(/[^a-z0-9]/g, "") || "jpeg";
}

export interface FetchFulltextDeps {
  /** Tier 1 — Europe PMC (by pmc id). */
  europePmc?: JatsSource;
  /** Tier 2 — publisher-direct JATS (by DOI). */
  publisherJats?: JatsSource;
  /** Tier 4 — Unpaywall OA-PDF locator (by DOI). Optional. */
  unpaywall?: OaPdfLocator;
  /** M5 — PMC figure-image fetcher. Optional (captions still ingest without it). */
  figureImages?: FigureImageFetcher;
}

export class FetchFulltextStage extends PipelineStage<ResolvedDoc, ResolvedDoc> {
  readonly name = "fetchFulltext";
  readonly inputQueue = Q.fetchFulltext;
  override readonly outputQueue = Q.prepare;
  override readonly concurrency: number;

  private readonly europePmc: JatsSource | undefined;
  private readonly publisherJats: JatsSource | undefined;
  private readonly unpaywall: OaPdfLocator | undefined;
  private readonly figureImages: FigureImageFetcher | undefined;

  constructor(
    deps: StageDeps,
    sources: FetchFulltextDeps,
    private readonly docState: DocStateStore,
    opts: { concurrency?: number } = {},
  ) {
    super(deps);
    this.concurrency = opts.concurrency ?? 6;
    this.europePmc = sources.europePmc;
    this.publisherJats = sources.publisherJats;
    this.unpaywall = sources.unpaywall;
    this.figureImages = sources.figureImages;
  }

  protected override async onExhausted(doc: ResolvedDoc, reason: string): Promise<void> {
    // A thrown transient source error that exhausts retries must still terminate the
    // doc — fall back to the PDF lane (or abstract) rather than fail.
    await this.fallback(doc, `fetchfulltext_exhausted: ${reason}`);
  }

  async process(doc: ResolvedDoc, ctx: StageContext): Promise<StageOutcome<ResolvedDoc>> {
    // Resume: JATS XML already fetched → re-parse from S3 (cheap, no network).
    const cachedXml = await this.blob.getBytes(keys.xml(doc.openaireId));
    if (cachedXml) {
      const parsed = parseJats(cachedXml.toString("utf8"));
      if (parsed.sections.length > 0) {
        const figures = await this.attachFigures(doc, parsed, ctx);
        return this.emitSections(doc, parsed.sections, figures, ctx, "cache");
      }
    }

    // Tier 1: Europe PMC by pmc id.
    const pmcid = doc.meta.pmcid ?? null;
    if (pmcid && this.europePmc?.fetchByPmcid) {
      const xml = await this.europePmc.fetchByPmcid(pmcid);
      if (xml) return this.ingestJats(doc, xml, ctx, "europepmc");
    }

    // Tier 2: publisher-direct JATS by DOI (eLife/PLOS).
    if (doc.meta.doi && this.publisherJats?.fetchByDoi) {
      const xml = await this.publisherJats.fetchByDoi(doc.meta.doi);
      if (xml) return this.ingestJats(doc, xml, ctx, "publisher");
    }

    // Tier 4: Unpaywall → an OA PDF url → the PDF+OCR lane.
    if (doc.meta.doi && this.unpaywall) {
      const pdfUrl = await this.unpaywall.findPdfUrl(doc.meta.doi);
      if (pdfUrl) {
        ctx.log.info("fulltext_unpaywall_pdf", { id: doc.openaireId });
        return this.handToPdf(doc, pdfUrl, ctx);
      }
    }

    // No JATS, no Unpaywall PDF: fall back to any pdfCandidates from resolve, else abstract.
    return this.fallbackOutcome(doc, "no_jats_no_oa_pdf", ctx);
  }

  /** Parse fetched XML, attach figures, persist, and emit section chunks. */
  private async ingestJats(
    doc: ResolvedDoc,
    xml: string,
    ctx: StageContext,
    source: string,
  ): Promise<StageOutcome<ResolvedDoc>> {
    const parsed = parseJats(xml);
    if (parsed.sections.length === 0) {
      // Parsed to nothing usable — try the next tier via the fallback chain.
      return this.fallbackOutcome(doc, `jats_empty_${source}`, ctx);
    }
    await this.blob.putBytes(keys.xml(doc.openaireId), Buffer.from(xml, "utf8"), "application/xml");
    const figures = await this.attachFigures(doc, parsed, ctx);
    return this.emitSections(doc, parsed.sections, figures, ctx, source);
  }

  /** Fetch + persist PMC figure images (M5). Only for the PMC tier (pmc id known)
   *  and only when a fetcher is wired. Returns the FigureRefs that got bytes. */
  private async attachFigures(
    doc: ResolvedDoc,
    parsed: ParsedJats,
    ctx: StageContext,
  ): Promise<FigureRef[]> {
    const pmcid = doc.meta.pmcid ?? null;
    if (!pmcid || !this.figureImages || parsed.figures.length === 0) return [];
    const out: FigureRef[] = [];
    let ordinal = 0;
    for (const fig of parsed.figures) {
      ordinal++;
      let img: { bytes: Buffer; contentType: string } | null;
      try {
        img = await this.figureImages.fetch({ pmcid, href: fig.href });
      } catch (e) {
        ctx.log.warn("figure_fetch_failed", { id: doc.openaireId, fig: fig.id, error: e instanceof Error ? e.message : String(e) });
        continue; // one figure failing never blocks the doc
      }
      if (!img) continue;
      const ext = extForContentType(img.contentType);
      await this.blob.putBytes(keys.figure(doc.openaireId, fig.id, ext), img.bytes, img.contentType);
      out.push({ id: fig.id, page: ordinal, contentType: img.contentType, caption: fig.caption, ext });
    }
    return out;
  }

  private emitSections(
    doc: ResolvedDoc,
    sections: DocSection[],
    figures: FigureRef[],
    ctx: StageContext,
    source: string,
  ): StageOutcome<ResolvedDoc> {
    ctx.log.info("fulltext_jats", {
      id: doc.openaireId,
      source,
      sections: sections.length,
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
      sections,
      ...(figures.length > 0 ? { figures } : {}),
    };
    return { kind: "emit", items: [withText] };
  }

  /** Route the doc to the PDF+OCR lane with `pdfUrl` as the top candidate. */
  private handToPdf(doc: ResolvedDoc, pdfUrl: string, ctx: StageContext): StageOutcome<ResolvedDoc> {
    void ctx;
    const host = hostOf(pdfUrl);
    const top: PdfCandidate = { url: pdfUrl, host, license: null };
    const existing = doc.pdfCandidates ?? [];
    const forPdf: ResolvedDoc = {
      ...doc,
      pdfCandidates: [top, ...existing.filter((c) => c.url !== pdfUrl)],
    };
    void this.queue.send(Q.fetchPdf, forPdf);
    return { kind: "done" };
  }

  /** JATS + Unpaywall both missed: use resolve's pdfCandidates if any, else abstract. */
  private fallbackOutcome(
    doc: ResolvedDoc,
    reason: string,
    ctx: StageContext,
  ): StageOutcome<ResolvedDoc> {
    ctx.log.warn("fulltext_fallback", { id: doc.openaireId, reason });
    void this.fallback(doc, reason);
    return { kind: "done" };
  }

  private async fallback(doc: ResolvedDoc, reason: string): Promise<void> {
    void reason;
    const candidates = doc.pdfCandidates ?? [];
    if (candidates.length > 0) {
      await this.queue.send(Q.fetchPdf, doc);
      return;
    }
    // No PDF path either → degrade to abstract/metadata.
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
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
