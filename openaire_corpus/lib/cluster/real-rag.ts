import "server-only"
// lib/cluster/real-rag.ts
// Real RAG implementation for CLUSTER_MODE=real.
//
// Queries the data-cluster MCP (datacluster_vector_search_chunks) over the
// project's dataset and maps chunk hits to the app's RagPassage shape
// (openaireId + doi + locator + snippet + score), so the research agent can
// cite by OpenAIRE id + locator.
//
// Dataset resolution: each project owns one cluster dataset, slug `openaire-<id>`.
// The numeric id is cached on `Project.clusterDatasetId`; the first query
// resolves it by listing datasets and matching the slug, then persists it.
//
// Consumed only via ClusterRagClient (lib/cluster/rag.ts) — never directly.

import {
  DATACLUSTER_DATASET_SLUG_PREFIX,
  DATACLUSTER_LIST_PAGE_SIZE,
  RAG_DEFAULT_K,
} from "@/lib/constants"
import {
  DataclusterMcpClient,
  DataclusterMcpNotFoundError,
} from "./datacluster-mcp-client"
import type {
  DataclusterChunk,
  DataclusterKeywordHit,
} from "./datacluster-mcp-client"
import type {
  RagEntryContent,
  RagEntryContentRequest,
  RagKeywordHit,
  RagKeywordRequest,
  RagKeywordResponse,
  RagPassage,
  RagQueryRequest,
  RagQueryResponse,
} from "./rag"

/** Hard cap on dataset-list pages walked while resolving a slug (anti-runaway). */
const MAX_DATASET_PAGES = 50

const MODEL_VERSION = "datacluster-mcp"

/**
 * Resolve the project's composite dataset id ("cluster:dataset") by matching the
 * slug `openaire-<projectId>` in the cluster's dataset list. The composite id is
 * the handle every downstream aggregator call (vector/keyword search, entry
 * reads) needs. Not cached in `Project.clusterDatasetId` (that column is a numeric
 * cluster-local id; the aggregator id is a string), so it resolves per call — one
 * cheap list roundtrip.
 *
 * Throws DataclusterMcpNotFoundError if the project has no dataset in the
 * cluster — an inconsistency, since rag tools only run after a committed ingestion.
 */
async function resolveDatasetComposite(
  projectId: string,
  client: DataclusterMcpClient,
): Promise<string> {
  const slug = `${DATACLUSTER_DATASET_SLUG_PREFIX}${projectId}`

  for (let page = 0; page < MAX_DATASET_PAGES; page++) {
    const offset = page * DATACLUSTER_LIST_PAGE_SIZE
    const datasets = await client.listDatasets(DATACLUSTER_LIST_PAGE_SIZE, offset)
    const match = datasets.find((d) => d.slug === slug)
    if (match) return match.composite_id
    // Short page → no more datasets to walk.
    if (datasets.length < DATACLUSTER_LIST_PAGE_SIZE) break
  }

  throw new DataclusterMcpNotFoundError(
    `No data-cluster dataset found for project ${projectId} (slug "${slug}"). ` +
      `The corpus may not have finished ingesting into the cluster.`,
  )
}

/**
 * Derive a citation locator from a chunk's section/page/section_id. "abstract" for
 * the abstract chunk, "s:<id>" for a JATS section, "p<N>" for a full-text PDF page,
 * null otherwise (metadata chunks, or a full-text chunk with no locator). Never
 * invented.
 */
function deriveLocator(section: unknown, page: unknown, sectionId: unknown): string | null {
  if (section === "abstract") return "abstract"
  if (typeof sectionId === "string" && /^[A-Za-z0-9_-]+$/.test(sectionId)) return `s:${sectionId}`
  if (typeof page === "number" && Number.isFinite(page)) return `p${page}`
  return null
}

/**
 * Map a cluster chunk to a RagPassage. Returns null when the chunk carries no
 * OpenAIRE id — it cannot serve as a citation source, so it is dropped (never
 * cited without an id; never an invented one). The locator is derived from the
 * chunk's section/page and left null when absent.
 */
function chunkToPassage(chunk: DataclusterChunk): RagPassage | null {
  const { openaire_id, doi, section, page, char_start, char_end, entry_id, year } =
    chunk.metadata
  const sectionId = chunk.metadata.section_id
  const sectionTitle = chunk.metadata.section_title
  if (typeof openaire_id !== "string" || openaire_id.length === 0) return null

  return {
    openaireId: openaire_id,
    doi: typeof doi === "string" && doi.length > 0 ? doi : null,
    locator: deriveLocator(section, page, sectionId),
    snippet: chunk.chunk_text,
    score: chunk.score,
    charRange: [
      typeof char_start === "number" ? char_start : 0,
      typeof char_end === "number" ? char_end : 0,
    ],
    entryId: typeof entry_id === "number" ? entry_id : null,
    ...(typeof year === "number" ? { year } : {}),
    ...(typeof sectionTitle === "string" && sectionTitle.length > 0
      ? { sectionTitle }
      : {}),
  }
}

/**
 * Translate the app's facet filters to keyword_search `metadata_filters`
 * (exact match on the dataset schema fields type / open_access_color / source).
 */
function toMetadataFilters(
  filters: RagKeywordRequest["filters"],
): Record<string, string> | undefined {
  if (!filters) return undefined
  const out: Record<string, string> = {}
  if (filters.type) out.type = filters.type
  if (filters.openAccessColor) out.open_access_color = filters.openAccessColor
  if (filters.source) out.source = filters.source
  return Object.keys(out).length > 0 ? out : undefined
}

/** Map a keyword hit to the app shape; drop hits with no OpenAIRE id (uncitable). */
function keywordHitToRag(hit: DataclusterKeywordHit): RagKeywordHit | null {
  const openaireId = hit.metadata?.openaire_id
  if (typeof openaireId !== "string" || openaireId.length === 0) return null
  const doi = hit.metadata?.doi
  const year = hit.metadata?.year
  return {
    openaireId,
    doi: typeof doi === "string" && doi.length > 0 ? doi : null,
    entryId: hit.entry_id,
    title: typeof hit.metadata?.title === "string" ? hit.metadata.title : null,
    year: typeof year === "number" ? year : null,
    score: hit.score,
    snippets: (hit.snippets ?? []).map((s) => s.text),
  }
}

export const RealRagRunner = {
  async query(req: RagQueryRequest): Promise<RagQueryResponse> {
    const client = new DataclusterMcpClient()
    const datasetComposite = await resolveDatasetComposite(req.projectId, client)

    // NB: `req.filters` (type/oa/year) are NOT pushed down — vector search only
    // filters by dataset_ids / entry_ids / score_threshold. The agent narrows
    // scope through the query text instead.
    const data = await client.vectorSearchChunks({
      query: req.query,
      limit: req.k ?? RAG_DEFAULT_K,
      datasetIds: [datasetComposite],
    })

    const passages = data.results
      .map(chunkToPassage)
      .filter((p): p is RagPassage => p !== null)

    return {
      passages,
      total: data.total,
      modelVersion: MODEL_VERSION,
    }
  },

  async keywordSearch(req: RagKeywordRequest): Promise<RagKeywordResponse> {
    const client = new DataclusterMcpClient()
    const datasetComposite = await resolveDatasetComposite(req.projectId, client)

    const data = await client.keywordSearch({
      query: req.query,
      limit: req.limit,
      datasetIds: [datasetComposite],
      metadataFilters: toMetadataFilters(req.filters),
    })

    const hits = data.results
      .map(keywordHitToRag)
      .filter((h): h is RagKeywordHit => h !== null)

    return { hits, total: data.pagination?.total ?? hits.length }
  },

  async getEntryContent(req: RagEntryContentRequest): Promise<RagEntryContent> {
    // The aggregator keys entry reads by the composite id "cluster:dataset:entry".
    // The entryId the agent holds is the registry entry id from a search result;
    // rebuild the composite from this project's dataset composite so it stays
    // scoped to the project (it cannot reach another project's entries).
    const client = new DataclusterMcpClient()
    const datasetComposite = await resolveDatasetComposite(req.projectId, client)
    const data = await client.getEntryContent({
      compositeId: `${datasetComposite}:${req.entryId}`,
      charOffset: req.charOffset,
      charLimit: req.charLimit,
    })

    return {
      entryId: data.entry_id,
      text: data.text,
      charOffset: data.char_offset,
      charLimit: data.char_limit,
      totalLength: data.total_length,
      hasMore: data.has_more,
      nextOffset: data.next_offset,
    }
  },
}
