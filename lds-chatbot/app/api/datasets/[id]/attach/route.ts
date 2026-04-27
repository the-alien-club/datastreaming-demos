import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { ok, notFound, unauthorized, unprocessable, conflict } from "@/lib/api-response"
import { datasetAttachBodySchema, parseBody } from "../../../_validators"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const parsed = await parseBody(request, datasetAttachBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  // 1. Load dataset from local DB (scoped to caller).
  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })
  if (!dataset) return notFound("Dataset not found")
  if (!dataset.clusterDatasetId) return unprocessable("Dataset not yet synced with cluster")

  // 2. Load agent from local DB (scoped to caller).
  const agent = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, body.agentId), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })
  if (!agent) return notFound("Agent not found")

  // Guard against duplicate attachments.
  const alreadyAttached = await db.query.agentSubagents.findFirst({
    where: (sa, { and, eq }) => and(eq(sa.agentId, body.agentId), eq(sa.datasetId, id)),
  })
  if (alreadyAttached) return conflict("Dataset already attached to this agent")

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
    model: agent.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: ["datacluster"],
  }

  // 4. Build the complete subagent list (existing + new corpus subagent)
  const existingSubagentConfigs: SubagentConfig[] = agent.subagents.map((sa) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
  }))

  const allSubagents = [...existingSubagentConfigs, corpusSubagentConfig]

  // 5. Rebuild workflow graph and PATCH it to the platform
  const steps = agent.steps ? JSON.parse(agent.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges } = buildAgentWorkflow({
    name: agent.name,
    systemPrompt: agent.systemPrompt ?? "",
    steps,
    model: agent.model ?? DEFAULT_MODEL_SLUG,
    subagents: allSubagents,
  }, mcpConfigs)

  if (!agent.workflowId) return unprocessable("Agent has no linked workflow")
  const token = await resolveAccessToken(session.user.id)
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

  return ok({ subagentId }, 201)
}
