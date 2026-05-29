import { z } from "zod"
import { ENTRY_STATUS } from "./schema"
import type { EntryStatus } from "./schema"
import type { DatasetSelect } from "./schema"

// ─── Request schemas ──────────────────────────────────────────────────────────

const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")
const ID = z.string().trim().min(1, "must be non-empty")

export const createDatasetSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
})
export type CreateDatasetData = z.infer<typeof createDatasetSchema>

// PATCH /api/datasets/:id — partial update. Any subset of fields is valid;
// unknown fields are ignored by the route handler.
export const updateDatasetSchema = z.object({
  name: NAME.optional(),
  description: SHORT_TEXT.nullable().optional(),
  isPublic: z.boolean().optional(),
})
export type UpdateDatasetData = z.infer<typeof updateDatasetSchema>

export const datasetAttachSchema = z.object({
  agentId: ID,
})
export type DatasetAttachData = z.infer<typeof datasetAttachSchema>

// ─── Response types ───────────────────────────────────────────────────────────

export type DatasetRow = DatasetSelect

// The list endpoint selects a specific set of columns (no userId) plus an
// aggregated attachedAgentCount — this does not match DatasetRow exactly.
export type DatasetListItem = {
  id: string
  clusterDatasetId: number | null
  name: string
  description: string | null
  status: string | null
  isPublic: boolean
  createdAt: Date | null
  updatedAt: Date | null
  attachedAgentCount: number
  isOwn: boolean
}
export type DatasetListResponse = DatasetListItem[]

export type DatasetDetailResponse = DatasetRow & {
  attachedAgents: { id: string; name: string | null }[]
}

export type DatasetAttachResponse = { subagentId: string }

// ─── Status response types ────────────────────────────────────────────────────

// Re-export the canonical status key type so downstream consumers
// (status route, components) use a single definition.
export type StatusKey = EntryStatus
export type Overall = "empty" | "uploading" | "processing" | "processed" | "error"

// All valid entry status values — derived from the domain enum.
export const STATUS_KEYS: StatusKey[] = Object.values(ENTRY_STATUS) as StatusKey[]

export type DatasetStatusResponse = {
  datasetId: string
  totalEntries: number
  byStatus: Record<StatusKey, number>
  overall: Overall
}

// ─── Entry response types ─────────────────────────────────────────────────────

// The SDK returns opaque entry objects; we expose them as unknown[] until the
// SDK ships a stable typed response. Routes annotate ok<EntryResponse>(data).
export type EntryResponse = unknown[]
