import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getClusterClient } from "@/lib/cluster/client"
import { resolveAccessToken } from "@/lib/auth-helpers"

type RouteContext = { params: Promise<{ id: string }> }

type StatusKey = "pending" | "uploading" | "uploaded" | "processing" | "processed" | "error"
type Overall = "empty" | "uploading" | "processing" | "processed" | "error"

const STATUS_KEYS: StatusKey[] = ["pending", "uploading", "uploaded", "processing", "processed", "error"]

function normalizeStatus(value: unknown): StatusKey | null {
  if (typeof value !== "string") return null
  const lower = value.toLowerCase()
  return (STATUS_KEYS as string[]).includes(lower) ? (lower as StatusKey) : null
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  if (!dataset.clusterDatasetId) {
    return Response.json({
      datasetId: id,
      totalEntries: 0,
      byStatus: { pending: 0, uploading: 0, uploaded: 0, processing: 0, processed: 0, error: 0 },
      overall: "empty" as Overall,
    })
  }

  const accessToken = await resolveAccessToken(session.user.id)
  const client = getClusterClient(accessToken)

  const result = await client.entries.listEntriesApiV1EntriesGet({
    datasetId: dataset.clusterDatasetId,
    limit: 500,
  })

  const raw = result as { entries?: unknown[]; items?: unknown[] }
  const entries = (raw.entries ?? raw.items ?? (Array.isArray(result) ? result : [])) as Array<{ status?: unknown }>

  const byStatus: Record<StatusKey, number> = {
    pending: 0,
    uploading: 0,
    uploaded: 0,
    processing: 0,
    processed: 0,
    error: 0,
  }

  for (const entry of entries) {
    const key = normalizeStatus(entry.status)
    if (key) byStatus[key]++
  }

  const totalEntries = entries.length

  let overall: Overall
  if (totalEntries === 0) {
    overall = "empty"
  } else if (byStatus.error > 0) {
    overall = "error"
  } else if (byStatus.processed === totalEntries) {
    overall = "processed"
  } else if (byStatus.processing > 0 || byStatus.uploaded > 0) {
    overall = "processing"
  } else if (byStatus.uploading > 0 || byStatus.pending > 0) {
    overall = "uploading"
  } else {
    overall = "empty"
  }

  return Response.json({
    datasetId: id,
    totalEntries,
    byStatus,
    overall,
  })
}
