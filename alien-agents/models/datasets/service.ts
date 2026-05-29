import "server-only"

import { getClusterClient } from "@/lib/cluster/client"
import { updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { DEFAULT_DATASET_PIPELINE_PRESET, DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { DATASET_STATUS, ENTRY_STATUS } from "./schema"
import {
  insertDataset,
  getDataset,
  getDatasetById,
  getDatasets,
  updateDatasetRecord,
  type DatasetRow,
} from "./queries"
import {
  getAgent,
  insertSubagent,
  updateAgentRecord,
  getSubagentByAgentAndDataset,
  getAttachedAgentCountsByDataset,
  getAgentsByDataset,
} from "@/models/agents/queries"
import type { CreateDatasetData, UpdateDatasetData, DatasetStatusResponse, Overall, StatusKey } from "./types"
import type { DatasetSelect } from "./schema"

// Subset of AgentSubagent fields required to create a corpus subagent record.
// Mirrors the Prisma unchecked-create shape; avoids importing the (in-flux)
// agents schema directly from the datasets service.
type AgentSubagentInsert = {
  id: string
  agentId: string
  name: string
  systemPrompt: string
  model?: string | null
  mcpIds?: string | null
  datasetId?: string | null
  nodeId?: string | null
  createdAt?: Date | null
}

// ─── Enriched read projections ────────────────────────────────────────────────
//
// These types extend the raw DatasetRow from queries.ts with cross-model data.
// They live here — not in queries.ts — because queries.ts is restricted to
// imports from @/lib/db and ./schema only.

export type DatasetSummary = DatasetRow & {
  attachedAgentCount: number
}

export type DatasetDetail = DatasetSelect & {
  attachedAgents: { id: string; name: string }[]
}

/**
 * Returns all datasets owned by `userId` (plus public datasets from other
 * users), newest first, with an attached-agent count per dataset.
 */
export async function getDatasetsSummary(userId: string): Promise<DatasetSummary[]> {
  const rows = await getDatasets(userId)
  if (rows.length === 0) return []

  const datasetIds = rows.map((r) => r.id)
  const countsByDataset = await getAttachedAgentCountsByDataset(datasetIds)

  return rows.map((r) => ({
    ...r,
    attachedAgentCount: countsByDataset[r.id] ?? 0,
  }))
}

/**
 * Returns a single dataset scoped to `userId` with the list of attached agents.
 * Returns `undefined` when no matching row exists.
 *
 * Attached agents are fetched via `models/agents/queries.ts` to satisfy the
 * cross-model query — no inline `db` calls here.
 */
export async function getDatasetDetail(
  id: string,
  userId: string,
): Promise<DatasetDetail | undefined> {
  const dataset = await getDataset(id, userId)
  if (!dataset) return undefined

  // Fetch distinct agents attached to this dataset that are owned by the same
  // user (defence in depth — prevents leaking agent names across tenant
  // boundaries). Delegated to agents/queries.ts — no raw db call in service.
  const attachedAgents = await getAgentsByDataset(id, userId)

  return {
    ...dataset,
    attachedAgents,
  }
}

// ─── Dataset creation ─────────────────────────────────────────────────────────

/**
 * Creates a dataset on the cluster, applies the pipeline preset, and persists
 * the local DB record. Returns the created dataset row.
 *
 * Throws if the cluster request fails.
 */
export async function createDataset(
  userId: string,
  data: CreateDatasetData,
): Promise<DatasetSelect> {
  const name = data.name.trim()
  const description = data.description?.trim() ?? ""
  const accessToken = await resolveAccessToken(userId)
  const client = getClusterClient(accessToken)

  // 1. Create dataset on cluster
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now()
  const clusterDataset = await client.datasets.createDatasetApiV1DatasetsPost({
    datasetCreateRequest: {
      name,
      slug,
      description,
      datasetType: "text",
      schemaDefinition: {
        schemaId: "default",
        version: "1.0",
        description: "General purpose document corpus",
        original: { metadataSchema: {} },
        processed: {},
        processing: null,
      },
    },
  })

  // 2. Apply the configured pipeline preset
  await client.pipelines.applyPresetApiV1PipelinesDatasetsDatasetIdApplyPresetPost({
    datasetId: clusterDataset.id,
    presetName: DEFAULT_DATASET_PIPELINE_PRESET,
  })

  // 3. Persist to local DB
  const datasetId = crypto.randomUUID()
  const now = new Date()

  return insertDataset({
    id: datasetId,
    userId,
    clusterDatasetId: clusterDataset.id,
    name,
    description: description || null,
    status: DATASET_STATUS.Pending,
    createdAt: now,
    updatedAt: now,
  })
}

// ─── Corpus subagent attachment ───────────────────────────────────────────────

/**
 * Attaches a dataset to an agent by creating a corpus specialist subagent node
 * in the workflow graph. Full orchestration:
 *
 *   1. Verify the caller owns both the dataset and the agent.
 *   2. Guard against duplicate attachments.
 *   3. Build the corpus subagent system prompt.
 *   4. Rebuild the complete workflow graph (existing subagents + new corpus subagent).
 *   5. PATCH the workflow on the platform.
 *   6. Persist the new subagent row to the local DB.
 *
 * Throws a typed error on every failure path — the route handler maps these to
 * the appropriate HTTP response. No `Response` objects are returned here.
 */
export async function attachDatasetToAgent(
  datasetId: string,
  agentId: string,
  userId: string,
): Promise<{ subagentId: string }> {
  // 1. Load dataset (scoped to caller)
  const dataset = await getDataset(datasetId, userId)
  if (!dataset) throw new DatasetNotFoundError(datasetId)
  if (!dataset.clusterDatasetId) throw new DatasetNotSyncedError(datasetId)

  // 2. Load agent (scoped to caller) via agents/queries.ts
  const agent = await getAgent(agentId, userId)
  if (!agent) throw new AgentNotFoundError(agentId)

  // 3. Guard against duplicate attachments
  const alreadyAttached = await getSubagentByAgentAndDataset(agentId, datasetId)
  if (alreadyAttached) throw new DatasetAlreadyAttachedError(datasetId, agentId)

  // 4. Build corpus subagent config
  const corpusSystemPrompt = `You are a document search specialist for the "${dataset.name}" corpus.

When searching, ALWAYS use datasetIds=[${dataset.clusterDatasetId}] to restrict searches to this specific corpus.

Your tools allow you to:
- Search documents by keyword (keyword_search)
- Search documents by semantic similarity (vector_search_chunks)
- Get full document content (get_entry_content)
- List documents in a dataset (get_entry_documents)

Always include dataset ID ${dataset.clusterDatasetId} in your search queries.
Return relevant excerpts with source references (entry IDs and titles).`

  const corpusDescription = `Specialist for searching the "${dataset.name}" corpus. Searches and retrieves documents from dataset ${dataset.clusterDatasetId}.`

  const corpusSubagentConfig: SubagentConfig = {
    name: `${dataset.name} Corpus`,
    description: corpusDescription,
    systemPrompt: corpusSystemPrompt,
    model: agent.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: ["datacluster"],
  }

  // 5. Rebuild workflow graph (existing + new corpus subagent)
  const existingSubagentConfigs: SubagentConfig[] = agent.subagents.map((sa: { name: string; systemPrompt: string; model?: string | null; mcpIds?: string | null }) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: sa.mcpIds ? (JSON.parse(sa.mcpIds) as string[]) : [],
  }))

  const allSubagents = [...existingSubagentConfigs, corpusSubagentConfig]
  const steps: { name: string; prompt: string }[] = agent.steps
    ? (JSON.parse(agent.steps) as { name: string; prompt: string }[])
    : []

  const mcpConfigs = await loadEnabledMcpConfigs(userId)
  const { nodes, edges } = buildAgentWorkflow(
    {
      name: agent.name,
      systemPrompt: agent.systemPrompt ?? "",
      steps,
      model: agent.model ?? DEFAULT_MODEL_SLUG,
      subagents: allSubagents,
    },
    mcpConfigs,
  )

  if (!agent.workflowId) throw new AgentNoWorkflowError(agentId)
  const token = await resolveAccessToken(userId)
  await updateWorkflow(agent.workflowId, { nodes, edges }, token)

  // 6. Persist the new corpus subagent row via agents/queries.ts
  const now = new Date()
  const subagentId = crypto.randomUUID()

  const subagentValues: AgentSubagentInsert = {
    id: subagentId,
    agentId: agent.id,
    name: corpusSubagentConfig.name,
    systemPrompt: corpusSubagentConfig.systemPrompt,
    model: corpusSubagentConfig.model,
    mcpIds: JSON.stringify(corpusSubagentConfig.mcpIds),
    datasetId: dataset.id,
    createdAt: now,
  }
  await insertSubagent(subagentValues)

  await updateAgentRecord(agentId, userId, { updatedAt: now })

  return { subagentId }
}

// ─── File upload ──────────────────────────────────────────────────────────────

/**
 * Uploads a single file to the cluster for the given dataset.
 * Creates an entry record then uploads the binary content.
 *
 * Returns the created entry object from the cluster.
 * Throws if the dataset has not yet been synced to the cluster.
 */
export async function uploadEntry(
  datasetId: string,
  clusterDatasetId: number,
  file: File,
  userId: string,
): Promise<unknown> {
  const accessToken = await resolveAccessToken(userId)
  const client = getClusterClient(accessToken)

  const slug =
    file.name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-") +
    "-" +
    crypto.randomUUID().slice(0, 8)

  const entryResponse = await client.entries.createEntryApiV1EntriesPost({
    entryCreateRequest: {
      datasetId: clusterDatasetId,
      name: file.name.replace(/\.[^.]+$/, ""),
      slug,
      description: "",
      metadata: {},
    },
  })

  const blob = new Blob([await file.arrayBuffer()], { type: file.type })
  await client.entries.uploadFileToEntryApiV1EntriesEntryIdUploadPost({
    entryId: entryResponse.entry.id,
    file: blob,
  })

  return entryResponse.entry
}

// ─── Entry status polling ─────────────────────────────────────────────────────

/**
 * Fetches entry status counts from the cluster for the given cluster dataset.
 * Returns the raw entry list; the route handler computes the `byStatus` map
 * and `overall` roll-up. Returns an empty array when `clusterDatasetId` is null.
 */
export async function getEntryStatus(
  clusterDatasetId: number,
  userId: string,
  limit = 500,
): Promise<Array<{ status?: unknown }>> {
  const accessToken = await resolveAccessToken(userId)
  const client = getClusterClient(accessToken)
  const result = await client.entries.listEntriesApiV1EntriesGet({
    datasetId: clusterDatasetId,
    limit,
  })
  const raw = result as { entries?: unknown[]; items?: unknown[] }
  return (
    raw.entries ?? raw.items ?? (Array.isArray(result) ? result : [])
  ) as Array<{ status?: unknown }>
}

// ─── Dataset update ───────────────────────────────────────────────────────────

/**
 * Normalises and applies a partial update to a dataset record.
 *
 * Callers must load the dataset and authorise the edit before calling this
 * method. The service owns the normalisation rules (trim, null-coercion) and
 * delegates the write to the query layer.
 *
 * @returns The updated dataset row.
 */
export async function updateDataset(
  datasetId: string,
  data: UpdateDatasetData,
): Promise<DatasetSelect> {
  const updates: Partial<{ name: string; description: string | null; isPublic: boolean }> = {}
  if (data.name !== undefined) updates.name = data.name.trim()
  if ("description" in data) updates.description = data.description ?? null
  if (data.isPublic !== undefined) updates.isPublic = data.isPublic

  const updated = await updateDatasetRecord(datasetId, updates)
  if (!updated) throw new DatasetNotFoundError(datasetId)
  return updated
}

// ─── Batch file upload ────────────────────────────────────────────────────────

// Upload caps. The data cluster fans these out to Argo workflows that
// process each file; without limits a single signed-in user can DoS
// the cluster by posting thousands of large binaries (review A-P1.4).
const MAX_FILES_PER_REQUEST = 10
const MAX_FILE_SIZE_BYTES = 50_000_000 // 50 MB
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
])

export class FileTooLargeError extends Error {
  constructor(fileName: string) {
    super(`${fileName} exceeds ${MAX_FILE_SIZE_BYTES} bytes`)
    this.name = "FileTooLargeError"
  }
}

export class FileMimeTypeError extends Error {
  constructor(fileName: string, mimeType: string) {
    super(`${fileName}: MIME type ${mimeType} not allowed`)
    this.name = "FileMimeTypeError"
  }
}

export class TooManyFilesError extends Error {
  constructor() {
    super(`At most ${MAX_FILES_PER_REQUEST} files per upload`)
    this.name = "TooManyFilesError"
  }
}

/**
 * Validates and uploads a batch of files for the given dataset to the cluster.
 *
 * Enforces per-request file count, per-file size, and MIME type constraints.
 * Throws a typed error on the first constraint violation — the route handler
 * maps these to the appropriate HTTP response.
 *
 * @returns An array of created entry objects from the cluster.
 */
export async function processEntryUpload(
  datasetId: string,
  clusterDatasetId: number,
  files: File[],
  userId: string,
): Promise<unknown[]> {
  if (files.length > MAX_FILES_PER_REQUEST) {
    throw new TooManyFilesError()
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new FileTooLargeError(file.name)
    }
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      throw new FileMimeTypeError(file.name, file.type)
    }
  }

  const results: unknown[] = []
  for (const file of files) {
    const entry = await uploadEntry(datasetId, clusterDatasetId, file, userId)
    results.push(entry)
  }
  return results
}

// ─── Status aggregation ───────────────────────────────────────────────────────

function normalizeEntryStatus(value: unknown): StatusKey | null {
  if (typeof value !== "string") return null
  const lower = value.toLowerCase()
  const keys: string[] = Object.values(ENTRY_STATUS)
  return keys.includes(lower) ? (lower as StatusKey) : null
}

/**
 * Fetches cluster entry statuses and aggregates them into a summary response.
 *
 * Returns an "empty" summary immediately when `clusterDatasetId` is null
 * (dataset not yet synced) so the route handler stays a simple pass-through.
 */
export async function getDatasetStatus(
  datasetId: string,
  clusterDatasetId: number | null,
  userId: string,
): Promise<DatasetStatusResponse> {
  if (clusterDatasetId === null) {
    return {
      datasetId,
      totalEntries: 0,
      byStatus: {
        [ENTRY_STATUS.Pending]: 0,
        [ENTRY_STATUS.Uploading]: 0,
        [ENTRY_STATUS.Uploaded]: 0,
        [ENTRY_STATUS.Processing]: 0,
        [ENTRY_STATUS.Processed]: 0,
        [ENTRY_STATUS.Error]: 0,
      },
      overall: "empty",
    }
  }

  const entries = await getEntryStatus(clusterDatasetId, userId)

  const byStatus: Record<StatusKey, number> = {
    [ENTRY_STATUS.Pending]: 0,
    [ENTRY_STATUS.Uploading]: 0,
    [ENTRY_STATUS.Uploaded]: 0,
    [ENTRY_STATUS.Processing]: 0,
    [ENTRY_STATUS.Processed]: 0,
    [ENTRY_STATUS.Error]: 0,
  }

  for (const entry of entries) {
    const key = normalizeEntryStatus(entry.status)
    if (key) byStatus[key]++
  }

  const totalEntries = entries.length

  let overall: Overall
  if (totalEntries === 0) {
    overall = "empty"
  } else if (byStatus[ENTRY_STATUS.Error] > 0) {
    overall = "error"
  } else if (byStatus[ENTRY_STATUS.Processed] === totalEntries) {
    overall = "processed"
  } else if (byStatus[ENTRY_STATUS.Processing] > 0 || byStatus[ENTRY_STATUS.Uploaded] > 0) {
    overall = "processing"
  } else if (byStatus[ENTRY_STATUS.Uploading] > 0 || byStatus[ENTRY_STATUS.Pending] > 0) {
    overall = "uploading"
  } else {
    overall = "empty"
  }

  return { datasetId, totalEntries, byStatus, overall }
}

// ─── Domain errors ────────────────────────────────────────────────────────────

export class DatasetNotFoundError extends Error {
  constructor(id: string) {
    super(`Dataset ${id} not found`)
    this.name = "DatasetNotFoundError"
  }
}

export class DatasetNotSyncedError extends Error {
  constructor(id: string) {
    super(`Dataset ${id} has not yet been synced to the cluster`)
    this.name = "DatasetNotSyncedError"
  }
}

export class DatasetAlreadyAttachedError extends Error {
  constructor(datasetId: string, agentId: string) {
    super(`Dataset ${datasetId} is already attached to agent ${agentId}`)
    this.name = "DatasetAlreadyAttachedError"
  }
}

export class AgentNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent ${id} not found`)
    this.name = "AgentNotFoundError"
  }
}

export class AgentNoWorkflowError extends Error {
  constructor(id: string) {
    super(`Agent ${id} has no linked workflow`)
    this.name = "AgentNoWorkflowError"
  }
}
