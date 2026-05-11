import { withAuth } from "@/app/api/_middleware"
import { ok, notFound, unprocessable, badRequest } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { getDatasetById } from "@/models/datasets/queries"
import { getEntryStatus, uploadEntry } from "@/models/datasets/service"
import type { EntryResponse } from "../../../_validators"

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

export const GET = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("view", dataset)

  if (!dataset.clusterDatasetId) return unprocessable("Dataset not yet synced with cluster")

  const entries = await getEntryStatus(dataset.clusterDatasetId, user.id, 100)
  return ok<EntryResponse>(entries)
})

export const POST = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("edit", dataset)

  if (!dataset.clusterDatasetId) return unprocessable("Dataset not yet synced with cluster")

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return badRequest("Expected multipart/form-data")
  }

  const rawEntries = formData.getAll("file")
  const files = rawEntries.filter((e): e is File => e instanceof File)
  if (files.length === 0) return unprocessable("At least one file is required")
  if (files.length > MAX_FILES_PER_REQUEST) {
    return unprocessable(`At most ${MAX_FILES_PER_REQUEST} files per upload`)
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return unprocessable(`${file.name} exceeds ${MAX_FILE_SIZE_BYTES} bytes`)
    }
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return unprocessable(`${file.name}: MIME type ${file.type} not allowed`)
    }
  }

  const results: unknown[] = []
  for (const file of files) {
    const entry = await uploadEntry(id, dataset.clusterDatasetId, file, user.id)
    results.push(entry)
  }
  return ok<EntryResponse>(results, 201)
})
