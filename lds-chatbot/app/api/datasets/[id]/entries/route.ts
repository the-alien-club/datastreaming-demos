import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getClusterClient } from "@/lib/cluster/client"
import { resolveAccessToken } from "@/lib/auth-helpers"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  if (!dataset.clusterDatasetId) {
    return Response.json({ error: "Dataset not yet synced with cluster" }, { status: 422 })
  }

  const accessToken = resolveAccessToken(session.user.id)
  const client = getClusterClient(accessToken)

  const result = await client.entries.listEntriesApiV1EntriesGet({
    datasetId: dataset.clusterDatasetId,
    limit: 100,
  })

  // The SDK returns { [key: string]: any } — extract entries array
  const raw = result as { entries?: unknown[]; items?: unknown[] }
  const entries = raw.entries ?? raw.items ?? (Array.isArray(result) ? result : [])

  return Response.json(entries)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  if (!dataset.clusterDatasetId) {
    return Response.json({ error: "Dataset not yet synced with cluster" }, { status: 422 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 })
  }

  const files = formData.getAll("file") as File[]
  if (files.length === 0) {
    return Response.json({ error: "At least one file is required" }, { status: 422 })
  }

  const accessToken = resolveAccessToken(session.user.id)
  const client = getClusterClient(accessToken)

  const results: unknown[] = []

  for (const file of files) {
    // 1. Create entry record on cluster
    const slug =
      file.name
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/g, "-") +
      "-" +
      Date.now()

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

  return Response.json(results, { status: 201 })
}
