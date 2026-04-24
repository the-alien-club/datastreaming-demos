import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  let body: { agentId: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.agentId || typeof body.agentId !== "string") {
    return Response.json({ error: "agentId is required" }, { status: 422 })
  }

  // 1. Load dataset from local DB
  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  if (!dataset.clusterDatasetId) {
    return Response.json({ error: "Dataset not yet synced with cluster" }, { status: 422 })
  }

  // 2. Load agent from local DB
  const agent = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, body.agentId),
    with: { subagents: true },
  })

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  // Guard against duplicate attachments
  const alreadyAttached = await db.query.agentSubagents.findFirst({
    where: (sa, { and, eq }) => and(eq(sa.agentId, body.agentId), eq(sa.datasetId, id)),
  })
  if (alreadyAttached) {
    return Response.json({ error: "Dataset already attached to this agent" }, { status: 409 })
  }

  // 3. Build corpus subagent config
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
    model: agent.model ?? "mistral-small-latest",
    mcpIds: ["datacluster"],
  }

  // 4. Build the complete subagent list (existing + new corpus subagent)
  const existingSubagentConfigs: SubagentConfig[] = agent.subagents.map((sa) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? "mistral-small-latest",
    mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
  }))

  const allSubagents = [...existingSubagentConfigs, corpusSubagentConfig]

  // 5. Rebuild workflow graph and PATCH it to the platform
  const steps = agent.steps ? JSON.parse(agent.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs()
  const { nodes, edges } = buildAgentWorkflow({
    name: agent.name,
    systemPrompt: agent.systemPrompt ?? "",
    steps,
    model: agent.model ?? "mistral-small-latest",
    subagents: allSubagents,
  }, mcpConfigs)

  if (!agent.workflowId) {
    return Response.json({ error: "Agent has no linked workflow" }, { status: 422 })
  }
  const token = resolveAccessToken(session.user.id)
  await updateWorkflow(agent.workflowId, { nodes, edges }, token)

  // 6. Persist the new corpus subagent to DB
  const now = new Date()
  const subagentId = crypto.randomUUID()

  await db.insert(agentSubagents).values({
    id: subagentId,
    agentId: agent.id,
    name: corpusSubagentConfig.name,
    systemPrompt: corpusSubagentConfig.systemPrompt,
    model: corpusSubagentConfig.model,
    mcpIds: JSON.stringify(corpusSubagentConfig.mcpIds),
    datasetId: dataset.id,
    createdAt: now,
  })

  await db
    .update(agents)
    .set({ updatedAt: now })
    .where(eq(agents.id, agent.id))

  return Response.json({ success: true, subagentId }, { status: 201 })
}
