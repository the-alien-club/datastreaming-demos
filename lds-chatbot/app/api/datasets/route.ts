import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { datasets, agentSubagents } from "@/lib/db/schema"
import { sql, desc, eq } from "drizzle-orm"
import { getClusterClient } from "@/lib/cluster/client"
import { resolveAccessToken } from "@/lib/auth-helpers"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await db
    .select({
      id: datasets.id,
      clusterDatasetId: datasets.clusterDatasetId,
      name: datasets.name,
      description: datasets.description,
      status: datasets.status,
      createdAt: datasets.createdAt,
      updatedAt: datasets.updatedAt,
      attachedAgentCount: sql<number>`count(distinct ${agentSubagents.agentId})`,
    })
    .from(datasets)
    .leftJoin(agentSubagents, eq(agentSubagents.datasetId, datasets.id))
    .groupBy(datasets.id)
    .orderBy(desc(datasets.createdAt))

  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { name: string; description?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 422 })
  }

  const name = body.name.trim()
  const description = body.description?.trim() ?? ""

  const accessToken = await resolveAccessToken(session.user.id)
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

  // 2. Apply the general_purpose pipeline preset
  await client.pipelines.applyPresetApiV1PipelinesDatasetsDatasetIdApplyPresetPost({
    datasetId: clusterDataset.id,
    presetName: "general_purpose",
  })

  // 3. Save to local DB
  const datasetId = crypto.randomUUID()
  const now = new Date()

  await db.insert(datasets).values({
    id: datasetId,
    clusterDatasetId: clusterDataset.id,
    name,
    description: description || null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, datasetId),
  })

  return Response.json(created, { status: 201 })
}
