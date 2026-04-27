import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getClusterClient } from "@/lib/cluster/client"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { ok, notFound, unauthorized, unprocessable, badRequest } from "@/lib/api-response"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })
  if (!dataset) return notFound("Dataset not found")
  if (!dataset.clusterDatasetId) return unprocessable("Dataset not yet synced with cluster")

  const accessToken = await resolveAccessToken(session.user.id)
  const client = getClusterClient(accessToken)

  const result = await client.entries.listEntriesApiV1EntriesGet({
    datasetId: dataset.clusterDatasetId,
    limit: 100,
  })

  // The SDK returns { [key: string]: any } — extract entries array.
  const raw = result as { entries?: unknown[]; items?: unknown[] }
  const entries = raw.entries ?? raw.items ?? (Array.isArray(result) ? result : [])

  return ok(entries)
}

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

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })
  if (!dataset) return notFound("Dataset not found")
  if (!dataset.clusterDatasetId) return unprocessable("Dataset not yet synced with cluster")

  let formData: FormData
  try {
    formData = await request.formData()
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

  const accessToken = await resolveAccessToken(session.user.id)
  const client = getClusterClient(accessToken)

  const results: unknown[] = []

  for (const file of files) {
    // 1. Create entry record on cluster. crypto.randomUUID for uniqueness
    // — Date.now() collided when two files of the same name were uploaded
    // in the same millisecond (review A-P1.4).
    const slug =
      file.name
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/g, "-") +
      "-" +
      crypto.randomUUID().slice(0, 8)

    const entryResponse = await client.entries.createEntryApiV1EntriesPost({
      entryCreateRequest: {
        datasetId: dataset.clusterDatasetId,
        name: file.name.replace(/\.[^.]+$/, ""),
        slug,
        description: "",
        metadata: {},
      },
    })

    // 2. Upload the file to the entry
    const blob = new Blob([await file.arrayBuffer()], { type: file.type })
    await client.entries.uploadFileToEntryApiV1EntriesEntryIdUploadPost({
      entryId: entryResponse.entry.id,
      file: blob,
    })

    results.push(entryResponse.entry)
  }

  return ok(results, 201)
}
