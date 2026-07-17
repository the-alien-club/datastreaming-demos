/**
 * Prepare stage — the convergence point of all lanes. Builds the doc's index
 * chunks from the resolved metadata (and, for the fulltext lane, the extracted
 * page texts — B-M2), persists a `doc.md` artifact, and emits a PreparedDoc to the
 * embed queue.
 *
 * B-M1 (abstract/metadata lanes):
 *   - chunk 0 = "title\n\nabstract" with locator {kind:"abstract"} when an abstract
 *     is present; otherwise a single formatted-metadata chunk {kind:"metadata"}.
 *
 * Builds the PreparedDoc from the INCOMING ResolvedDoc's identity — it does NOT use
 * the base outcome cache, whose replayed payload would carry a prior job's
 * identity on a re-ingest.
 */
import { PipelineStage, type StageDeps } from "../core/stage.js";
import type { StageContext, StageOutcome } from "../core/types.js";
import type { DocStateStore } from "../domain/doc-state.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { DocSection, OaMeta, PreparedChunk, PreparedDoc, ResolvedDoc } from "../domain/types.js";
import { failDoc } from "./doc-fail.js";
import { renderMarkdown } from "../live/render.js";

/** Build the chunks for an abstract/metadata doc. Pure — exported for tests. */
export function buildMetaChunks(meta: OaMeta): PreparedChunk[] {
  const abstract = meta.abstract?.trim();
  if (abstract && abstract.length > 0) {
    return [
      {
        index: 0,
        text: `${meta.title}\n\n${abstract}`.trim(),
        locator: { kind: "abstract" },
      },
    ];
  }
  return [
    {
      index: 0,
      text: renderMetadataText(meta),
      locator: { kind: "metadata" },
    },
  ];
}

const MAX_CHUNK_CHARS = 4000;
const MIN_PAGE_CHARS = 200;

/**
 * Build chunks for a fulltext doc: a lead chunk (title + abstract, or title alone),
 * then one chunk per page. Pages > MAX_CHUNK_CHARS split into parts; pages
 * < MIN_PAGE_CHARS merge forward into the next page (their text isn't lost, and we
 * don't waste an embedding on a near-empty page). Pure — exported for tests.
 */
export function buildPageChunks(meta: OaMeta, pageTexts: string[]): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  let index = 0;

  const abstract = meta.abstract?.trim();
  const lead = abstract && abstract.length > 0 ? `${meta.title}\n\n${abstract}`.trim() : meta.title;
  chunks.push({ index: index++, text: lead, locator: { kind: "abstract" } });

  // Merge tiny pages forward, carrying the source page number of the first page.
  const merged: Array<{ page: number; text: string }> = [];
  let carry = "";
  let carryPage = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const page = i + 1;
    const text = (pageTexts[i] ?? "").trim();
    if (text.length === 0) continue;
    const combined = carry ? `${carry}\n\n${text}` : text;
    const startPage = carry ? carryPage : page;
    if (combined.length < MIN_PAGE_CHARS && i < pageTexts.length - 1) {
      carry = combined;
      carryPage = startPage;
      continue;
    }
    merged.push({ page: startPage, text: combined });
    carry = "";
    carryPage = 0;
  }
  if (carry) merged.push({ page: carryPage, text: carry });

  for (const { page, text } of merged) {
    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ index: index++, text, locator: { kind: "page", page } });
      continue;
    }
    const parts = splitText(text, MAX_CHUNK_CHARS);
    for (let p = 0; p < parts.length; p++) {
      chunks.push({ index: index++, text: parts[p]!, locator: { kind: "page", page, part: p } });
    }
  }
  return chunks;
}

/**
 * Build chunks for a JATS full-text doc: a lead chunk (title + abstract, or title
 * alone), then one chunk per section. Sections > MAX_CHUNK_CHARS split into parts
 * carrying the section id/title; empty sections are skipped. Section text is already
 * clean (no OCR), so there is no tiny-section forward-merge — a short "Acknowledgements"
 * is a legitimate standalone citable section. Pure — exported for tests.
 */
export function buildSectionChunks(meta: OaMeta, sections: DocSection[]): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  let index = 0;

  const abstract = meta.abstract?.trim();
  const lead = abstract && abstract.length > 0 ? `${meta.title}\n\n${abstract}`.trim() : meta.title;
  chunks.push({ index: index++, text: lead, locator: { kind: "abstract" } });

  for (const sec of sections) {
    const text = sec.text.trim();
    if (text.length === 0) continue;
    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ index: index++, text, locator: { kind: "section", id: sec.id, title: sec.title } });
      continue;
    }
    const parts = splitText(text, MAX_CHUNK_CHARS);
    for (let p = 0; p < parts.length; p++) {
      chunks.push({
        index: index++,
        text: parts[p]!,
        locator: { kind: "section", id: sec.id, title: sec.title, part: p },
      });
    }
  }
  return chunks;
}

/** Split on paragraph/sentence boundaries under `max`, hard-splitting only if a
 *  single segment exceeds it. */
function splitText(text: string, max: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n\n+/)) {
    if (para.length > max) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
      continue;
    }
    const next = buf ? `${buf}\n\n${para}` : para;
    if (next.length > max) {
      out.push(buf);
      buf = para;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** A formatted, embeddable metadata record for docs with no abstract/full text. */
export function renderMetadataText(meta: OaMeta): string {
  const lines = [meta.title];
  if (meta.authors.length > 0) lines.push(`Authors: ${meta.authors.join(", ")}`);
  if (meta.year !== null) lines.push(`Year: ${meta.year}`);
  if (meta.venue) lines.push(`Venue: ${meta.venue}`);
  if (meta.publisher) lines.push(`Publisher: ${meta.publisher}`);
  if (meta.type) lines.push(`Type: ${meta.type}`);
  if (meta.subjects.length > 0) lines.push(`Subjects: ${meta.subjects.join(", ")}`);
  return lines.join("\n");
}

export class PrepareStage extends PipelineStage<ResolvedDoc, PreparedDoc> {
  readonly name = "prepare";
  readonly inputQueue = Q.prepare;
  override readonly outputQueue = Q.embed;
  override readonly concurrency = 8;

  constructor(
    deps: StageDeps,
    private readonly docState: DocStateStore,
  ) {
    super(deps);
  }

  protected override async onExhausted(doc: ResolvedDoc, reason: string): Promise<void> {
    await this.docState.setStatus(doc.docJobId, "failed", {
      error: `prepare_failed_after_retries: ${reason}`,
    });
  }

  async process(doc: ResolvedDoc, ctx: StageContext): Promise<StageOutcome<PreparedDoc>> {
    // Fulltext lane carries either structured sections (JATS → section chunks) or
    // extracted page texts (PDF/OCR → page chunks); both lead with title+abstract.
    // Abstract/metadata lanes build from meta. Sections take precedence.
    const chunks =
      doc.sections && doc.sections.length > 0
        ? buildSectionChunks(doc.meta, doc.sections)
        : doc.pageTexts && doc.pageTexts.length > 0
          ? buildPageChunks(doc.meta, doc.pageTexts)
          : buildMetaChunks(doc.meta);
    if (chunks.length === 0) {
      return failDoc(this.docState, doc.docJobId, "prepare_no_chunks");
    }

    const markdown = renderMarkdown(doc.meta, chunks);
    await this.blob.putBytes(
      keys.doc(doc.openaireId),
      Buffer.from(markdown, "utf8"),
      "text/markdown; charset=utf-8",
    );
    await this.blob.putJson(keys.chunks(doc.openaireId), chunks);
    ctx.log.info("prepared", { id: doc.openaireId, lane: doc.lane, chunks: chunks.length });

    const prepared: PreparedDoc = {
      projectId: doc.projectId,
      docJobId: doc.docJobId,
      openaireId: doc.openaireId,
      doi: doc.doi,
      ...(doc.runId !== undefined ? { runId: doc.runId } : {}),
      lane: doc.lane,
      meta: doc.meta,
      chunks,
      ...(doc.figures && doc.figures.length > 0 ? { figures: doc.figures } : {}),
    };
    return { kind: "emit", items: [prepared] };
  }
}
