import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { datasets, agentSubagents } from "@/lib/db/schema"
import { sql, and, desc, eq, ne } from "drizzle-orm"
import { getClusterClient } from "@/lib/cluster/client"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { ok, unauthorized } from "@/lib/api-response"
import { createDatasetBodySchema, parseBody } from "../_validators"
import { DEFAULT_DATASET_PIPELINE_PRESET } from "@/lib/constants"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const cols = {
    id: datasets.id,
    clusterDatasetId: datasets.clusterDatasetId,
    name: datasets.name,
    description: datasets.description,
    status: datasets.status,
    isPublic: datasets.isPublic,
    createdAt: datasets.createdAt,
    updatedAt: datasets.updatedAt,
    attachedAgentCount: sql<number>`count(distinct ${agentSubagents.agentId})`,
  }

  const [ownRows, publicRows] = await Promise.all([
    db.select(cols)
      .from(datasets)
      .leftJoin(agentSubagents, eq(agentSubagents.datasetId, datasets.id))
      .where(eq(datasets.userId, session.user.id))
      .groupBy(datasets.id)
      .orderBy(desc(datasets.createdAt)),
    db.select(cols)
      .from(datasets)
      .leftJoin(agentSubagents, eq(agentSubagents.datasetId, datasets.id))
      .where(and(eq(datasets.isPublic, true), ne(datasets.userId, session.user.id)))
      .groupBy(datasets.id)
      .orderBy(desc(datasets.createdAt)),
  ])

  return ok([
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ])
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const parsed = await parseBody(request, createDatasetBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

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

  // 2. Apply the configured pipeline preset.
  await client.pipelines.applyPresetApiV1PipelinesDatasetsDatasetIdApplyPresetPost({
    datasetId: clusterDataset.id,
    presetName: DEFAULT_DATASET_PIPELINE_PRESET,
  })

  // 3. Save to local DB
  const datasetId = crypto.randomUUID()
  const now = new Date()

  await db.insert(datasets).values({
    id: datasetId,
    userId: session.user.id,
    clusterDatasetId: clusterDataset.id,
    name,
    description: description || null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, datasetId), eq(d.userId, session.user.id)),
  })

  return ok(created, 201)
}
