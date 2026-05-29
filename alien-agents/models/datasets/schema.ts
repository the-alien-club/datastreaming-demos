import { Prisma } from "@/lib/generated/prisma/client"

// ─── Domain enums ──────────────────────────────────────────────────────────────

export const DATASET_STATUS = {
  Pending: "pending",
  Processing: "processing",
  Ready: "ready",
  Error: "error",
} as const
export type DatasetStatus = (typeof DATASET_STATUS)[keyof typeof DATASET_STATUS]

export const ENTRY_STATUS = {
  Pending: "pending",
  Uploading: "uploading",
  Uploaded: "uploaded",
  Processing: "processing",
  Processed: "processed",
  Error: "error",
} as const
export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS]

/** Entry statuses that indicate processing is still underway. */
export const IN_PROGRESS_ENTRY_STATUSES = new Set<EntryStatus>([
  ENTRY_STATUS.Pending,
  ENTRY_STATUS.Uploading,
  ENTRY_STATUS.Processing,
])

// ─── Query shapes ──────────────────────────────────────────────────────────────
//
// Prisma v7 no longer ships `Prisma.validator` in the generated client.
// `satisfies` achieves the same goal: the object literal is constrained to a
// valid `DatasetDefaultArgs` shape, literal types are preserved, and
// `DatasetGetPayload<typeof shape>` derives an accurate TypeScript type.

// Plain dataset row. Used by policies and every query that returns a single
// dataset or a list of datasets without cross-model relations.
export const datasetRow = {
  select: {
    id: true,
    userId: true,
    clusterDatasetId: true,
    name: true,
    description: true,
    status: true,
    isPublic: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.DatasetDefaultArgs
export type DatasetSelect = Prisma.DatasetGetPayload<typeof datasetRow>

// ─── Insert shape ──────────────────────────────────────────────────────────────
// Input type for write operations — not a query return shape. Hand-written
// because callers pass a controlled subset and Prisma handles defaults.

export type DatasetInsert = {
  id: string
  userId: string
  clusterDatasetId?: number | null
  name: string
  description?: string | null
  status?: string | null
  isPublic?: boolean
  createdAt?: Date
  updatedAt?: Date
}
