/**
 * Live ClusterSink — writes a resolved OpenAIRE record into the project's
 * data-cluster dataset (the RAG store), reusing V1's proven transport
 * (`ClusterHttp`) and the OpenAIRE dataset helpers.
 *
 * The write sequence (idempotent, tombstone-then-insert):
 *   ensureDataset → get-by-slug, else create (slug = openaire-<projectId>).
 *   upsert        → (tombstone any stale entry) → create entry (name = doi ??
 *                   openaireId, slug = sanitized openaireId) → upload the original
 *                   (doc.md, or the PDF for fulltext) → save processed content →
 *                   index one chunk per prepared chunk with its precomputed
 *                   embedding. Per-chunk metadata carries openaire_id + doi + the
 *                   section/page locator so citations survive.
 *
 * Transport reuse: V1's `ClusterClient` cannot be imported (its multipart body
 * builds `new Blob([Buffer])`, which V2's stricter NodeNext lib resolution
 * rejects). We reuse the lower transport (`ClusterHttp`) and re-express the thin
 * REST calls here with a correctly-typed `Uint8Array` multipart body.
 */
import { FormData } from "undici";

import { openaireDatasetSchema, openaireDatasetSlug } from "./vendor/dataset.js";
import { ClusterHttp } from "./cluster-http.js";
import { oaSlug } from "../domain/keys.js";
import type { OaMeta, PreparedChunk } from "../domain/types.js";
import type { ClusterSink } from "../ports.js";

interface DatasetView {
  id: number;
  name?: string;
  slug?: string;
}

interface EntryView {
  id: number;
  slug?: string;
}

interface CreateEntryResponse {
  entry?: EntryView;
  id?: number;
}

/** One chunk to index — the shape the cluster's /chunks endpoint expects. */
export interface IndexChunk {
  chunk_text: string;
  chunk_index: number;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface LiveClusterSinkOptions {
  http?: ClusterHttp;
}

/** The section label for a chunk's locator — the cluster's filter/citation key. */
function sectionOf(locator: PreparedChunk["locator"]): "abstract" | "metadata" | "fulltext" {
  if (locator.kind === "abstract") return "abstract";
  if (locator.kind === "metadata") return "metadata";
  return "fulltext";
}

/**
 * Build the per-chunk index chunks (one per prepared chunk). Pure — exported for
 * testing. Aligns each chunk with its embedding by position; the caller guarantees
 * `chunks.length === embeddings.length`.
 */
export function buildIndexChunks(
  openaireId: string,
  meta: OaMeta,
  chunks: PreparedChunk[],
  embeddings: number[][],
): IndexChunk[] {
  return chunks.map((c, i) => {
    const page = c.locator.kind === "page" ? c.locator.page : null;
    const metadata: Record<string, unknown> = {
      openaire_id: openaireId,
      doi: meta.doi,
      page,
      section: sectionOf(c.locator),
      year: meta.year,
      doc_type: meta.type,
    };
    return {
      chunk_text: c.text,
      chunk_index: i,
      embedding: embeddings[i]!,
      metadata,
    };
  });
}

export class LiveClusterSink implements ClusterSink {
  private readonly http: ClusterHttp;

  constructor(opts: LiveClusterSinkOptions = {}) {
    this.http = opts.http ?? new ClusterHttp();
  }

  async ensureDataset(input: { projectId: string }): Promise<{ datasetId: number }> {
    const slug = openaireDatasetSlug(input.projectId);
    const existing = await this.http.getJsonOrNull<DatasetView>(
      `/api/v1/datasets/slug/${encodeURIComponent(slug)}`,
    );
    if (existing) return { datasetId: existing.id };
    const created = await this.http.postJson<DatasetView>("/api/v1/datasets", {
      name: `OpenAIRE ${input.projectId}`,
      slug,
      description: `OpenAIRE corpus dataset for project ${input.projectId}`,
      dataset_type: "text",
      schema_definition: openaireDatasetSchema(input.projectId),
    });
    return { datasetId: created.id };
  }

  async upsert(input: {
    datasetId: number;
    openaireId: string;
    meta: OaMeta;
    lane: string;
    chunks: PreparedChunk[];
    embeddings: number[][];
    original: { filename: string; bytes: Buffer; contentType: string };
    markdown: string;
    hasFulltext: boolean;
  }): Promise<{ entryId: number }> {
    const { datasetId, openaireId, meta, chunks, embeddings, original, markdown, hasFulltext } =
      input;
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `cluster upsert: ${chunks.length} chunks but ${embeddings.length} embeddings for ${openaireId}`,
      );
    }

    const slug = oaSlug(openaireId);
    const existing = await this.findEntryBySlug(datasetId, slug);
    if (existing) await this.http.deleteJson(`/api/v1/entries/${existing.id}`);

    const entry = await this.createEntry({
      dataset_id: datasetId,
      // Name = doi ?? openaireId (short, unique, < 255); full title in metadata.
      name: meta.doi ?? openaireId,
      slug,
      description: (meta.abstract ?? meta.title).slice(0, 200),
      metadata: {
        openaire_id: openaireId,
        doi: meta.doi,
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        venue: meta.venue,
        publisher: meta.publisher,
        type: meta.type,
        best_access_right: meta.bestAccessRight,
        open_access_color: meta.openAccessColor,
        has_fulltext: hasFulltext,
        source: "openaire",
      },
    });

    await this.uploadOriginalFile(entry.id, original.filename, original.bytes, original.contentType);
    await this.http.postJson(`/api/v1/entries/${entry.id}/processed`, {
      content: { text: markdown },
    });
    await this.http.postJson(`/api/v1/entries/${entry.id}/chunks`, {
      chunks: buildIndexChunks(openaireId, meta, chunks, embeddings),
      collection_name: "entry_chunks",
    });

    return { entryId: entry.id };
  }

  /**
   * Find an entry by (datasetId, slug). The cluster's list endpoint doesn't honor a
   * `slug` query param, so we page and filter client-side (page_size=100, max 50
   * pages). Returns null when not found.
   */
  private async findEntryBySlug(datasetId: number, slug: string): Promise<EntryView | null> {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.http.getJson<{
        entries?: EntryView[];
        total_pages?: number;
      }>(`/api/v1/entries?dataset_id=${datasetId}&page=${page}&page_size=${PAGE_SIZE}`);
      const hit = (res.entries ?? []).find((e) => e.slug === slug);
      if (hit) return hit;
      const totalPages = res.total_pages ?? 1;
      if (page >= totalPages) return null;
    }
    return null;
  }

  /** Create an entry, tolerating both `{ entry: {...} }` and bare `{...}` shapes. */
  private async createEntry(input: {
    dataset_id: number;
    name: string;
    slug: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<EntryView> {
    const res = await this.http.postJson<CreateEntryResponse | EntryView>("/api/v1/entries", input);
    if (res && typeof res === "object" && "entry" in res && res.entry) {
      return res.entry;
    }
    if (res && typeof res === "object" && "id" in res && typeof (res as EntryView).id === "number") {
      return res as EntryView;
    }
    throw new Error(`createEntry: unexpected response shape: ${JSON.stringify(res).slice(0, 200)}`);
  }

  /**
   * Multipart upload of the doc's `original` file. The body is rebuilt per attempt
   * (undici FormData / its stream is single-use), and the bytes are wrapped in a
   * `Uint8Array` — a valid `BlobPart` under NodeNext.
   */
  private async uploadOriginalFile(
    entryId: number,
    filename: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void> {
    const formFactory = (): FormData => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
      form.set("file", blob, filename);
      form.set("file_type", "original");
      return form;
    };
    await this.http.postForm(`/api/v1/entries/${entryId}/upload`, formFactory);
  }
}
