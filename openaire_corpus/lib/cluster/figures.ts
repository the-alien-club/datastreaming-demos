import "server-only"
// lib/cluster/figures.ts
// Server-side fetch of a stored figure image from the data-cluster, for the
// figure image-proxy route. A figure is uploaded by the ingest worker as a
// `processed` entry file (fig-<id>.<ext>) and recorded in the entry metadata's
// `figures[]`. Here we resolve the dataset + entry for an OpenAIRE id, look up
// the figure's filename, and stream the bytes back through the cluster REST proxy
// (BACKEND_API_URL/clusters/CLUSTER_ID/proxy) so the browser never sees the token.
//
// Mirrors the worker's slug convention (oaSlug) so entry lookups line up.

import { requireClusterRestEnv } from "@/lib/env"
import {
  DATACLUSTER_DATASET_SLUG_PREFIX,
  DATACLUSTER_LIST_PAGE_SIZE,
} from "@/lib/constants"
import { prisma } from "@/lib/db"

/** Must match the worker's keys.ts oaSlug — the entry slug is oaSlug(openaireId). */
function oaSlug(openaireId: string): string {
  return openaireId.replace(/[^a-zA-Z0-9_.-]/g, "_")
}

/** Hard cap on dataset/entry list pages walked (anti-runaway). */
const MAX_PAGES = 50

export interface FigureImage {
  bytes: Buffer
  contentType: string
}

/** A figure available on a document — what the research agent needs to embed it. */
export interface FigureDescriptor {
  id: string
  caption: string
  page: number | null
}

interface FigureMeta {
  id?: string
  caption?: string
  page?: number
  file?: string
}

function restBase(): { base: string; auth: Record<string, string> } {
  const { BACKEND_API_URL, CLUSTER_ID, CLUSTER_BEARER_TOKEN } = requireClusterRestEnv()
  return {
    base: `${BACKEND_API_URL.replace(/\/+$/, "")}/clusters/${CLUSTER_ID}/proxy/api/v1`,
    auth: { Authorization: `Bearer ${CLUSTER_BEARER_TOKEN}`, accept: "application/json" },
  }
}

async function getJson<T>(url: string, auth: Record<string, string>): Promise<T | null> {
  const res = await fetch(url, { headers: auth })
  if (!res.ok) return null
  return (await res.json()) as T
}

/** Resolve the project's numeric dataset id (cached on Project.clusterDatasetId). */
async function resolveDatasetId(
  projectId: string,
  base: string,
  auth: Record<string, string>,
): Promise<number | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clusterDatasetId: true },
  })
  if (project?.clusterDatasetId != null) return project.clusterDatasetId

  const slug = `${DATACLUSTER_DATASET_SLUG_PREFIX}${projectId}`
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getJson<{ datasets?: Array<{ id: number; slug?: string }>; total_pages?: number }>(
      `${base}/datasets?page=${page}&page_size=${DATACLUSTER_LIST_PAGE_SIZE}`,
      auth,
    )
    const hit = (data?.datasets ?? []).find((d) => d.slug === slug)
    if (hit) return hit.id
    if (!data || page >= (data.total_pages ?? 1)) break
  }
  return null
}

/** Find the entry id for an OpenAIRE id (matched by slug) within a dataset. */
async function findEntryId(
  base: string,
  auth: Record<string, string>,
  datasetId: number,
  slug: string,
): Promise<number | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getJson<{ entries?: Array<{ id: number; slug?: string }>; total_pages?: number }>(
      `${base}/entries?dataset_id=${datasetId}&page=${page}&page_size=100`,
      auth,
    )
    const hit = (data?.entries ?? []).find((e) => e.slug === slug)
    if (hit) return hit.id
    if (!data || (data.entries ?? []).length < 100) break
  }
  return null
}

/** Read the entry's figures[] descriptor from its manifest metadata. */
async function getEntryFigures(
  base: string,
  auth: Record<string, string>,
  entryId: number,
): Promise<FigureMeta[]> {
  const data = await getJson<{
    entry?: Record<string, unknown>
    manifest?: { original?: { metadata?: { figures?: FigureMeta[] } } }
  }>(`${base}/entries/${entryId}`, auth)
  const e = (data?.entry ?? data ?? {}) as {
    manifest?: { original?: { metadata?: { figures?: FigureMeta[] } } }
  }
  return e.manifest?.original?.metadata?.figures ?? []
}

/**
 * List the figures available on a document (id + caption + page). Used by the
 * research agent's `rag_list_figures` tool so it can embed a figure with
 * `![[openaireId|caption|figureId]]`. Returns [] when nothing resolves.
 */
export async function listFigures(
  projectId: string,
  openaireId: string,
): Promise<FigureDescriptor[]> {
  const { base, auth } = restBase()
  const datasetId = await resolveDatasetId(projectId, base, auth)
  if (datasetId == null) return []
  const entryId = await findEntryId(base, auth, datasetId, oaSlug(openaireId))
  if (entryId == null) return []
  return (await getEntryFigures(base, auth, entryId))
    .filter((f): f is FigureMeta & { id: string } => typeof f.id === "string" && f.id.length > 0)
    .map((f) => ({
      id: f.id,
      caption: typeof f.caption === "string" ? f.caption : "",
      page: typeof f.page === "number" ? f.page : null,
    }))
}

/**
 * Fetch a figure image by (projectId, openaireId, figureId). Returns null when the
 * dataset/entry/figure can't be resolved (→ the route answers 404). Never throws
 * for a missing figure; only a misconfigured env throws (via requireClusterRestEnv).
 */
export async function fetchFigureImage(
  projectId: string,
  openaireId: string,
  figureId: string,
): Promise<FigureImage | null> {
  const { base, auth } = restBase()

  const datasetId = await resolveDatasetId(projectId, base, auth)
  if (datasetId == null) return null

  const entryId = await findEntryId(base, auth, datasetId, oaSlug(openaireId))
  if (entryId == null) return null

  const fig = (await getEntryFigures(base, auth, entryId)).find((f) => f.id === figureId)
  if (!fig?.file) return null

  const res = await fetch(
    `${base}/entries/${entryId}/download?file_type=processed&filename=${encodeURIComponent(fig.file)}`,
    { headers: { Authorization: auth.Authorization! } },
  )
  if (!res.ok) return null
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  }
}
