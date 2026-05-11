import { withAuth } from "@/app/api/_middleware"
import { ok, notFound } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { getDatasetById } from "@/models/datasets/queries"
import { getEntryStatus } from "@/models/datasets/service"
import { ENTRY_STATUS } from "@/models/datasets/schema"
import {
  type DatasetStatusResponse,
  type StatusKey,
  type Overall,
  STATUS_KEYS,
} from "../../../_validators"

function normalizeStatus(value: unknown): StatusKey | null {
  if (typeof value !== "string") return null
  const lower = value.toLowerCase()
  return (STATUS_KEYS as string[]).includes(lower) ? (lower as StatusKey) : null
}

export const GET = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("view", dataset)

  if (!dataset.clusterDatasetId) {
    return ok<DatasetStatusResponse>({
      datasetId: id,
      totalEntries: 0,
      byStatus: { pending: 0, uploading: 0, uploaded: 0, processing: 0, processed: 0, error: 0 },
      overall: "empty",
    })
  }

  const entries = await getEntryStatus(dataset.clusterDatasetId, user.id)

  const byStatus: Record<StatusKey, number> = {
    [ENTRY_STATUS.Pending]: 0,
    [ENTRY_STATUS.Uploading]: 0,
    [ENTRY_STATUS.Uploaded]: 0,
    [ENTRY_STATUS.Processing]: 0,
    [ENTRY_STATUS.Processed]: 0,
    [ENTRY_STATUS.Error]: 0,
  }

  for (const entry of entries) {
    const key = normalizeStatus(entry.status)
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

  return ok<DatasetStatusResponse>({
    datasetId: id,
    totalEntries,
    byStatus,
    overall,
  })
})
