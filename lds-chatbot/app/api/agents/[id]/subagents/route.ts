import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { ok, notFound, unauthorized, unprocessable } from "@/lib/api-response"
import { parseBody, subagentCreateBodySchema, subagentDeleteBodySchema } from "../../../_validators"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!existing) return notFound("Agent not found")

  const parsed = await parseBody(request, subagentCreateBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  // Build new subagent list (existing + new).
  const existingSubagentConfigs: SubagentConfig[] = existing.subagents.map((sa) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
  }))

  const newSubagentConfig: SubagentConfig = {
    name: body.name,
    description: body.description ?? "",
    systemPrompt: body.systemPrompt,
    model: body.model,
    mcpIds: body.mcpIds,
  }

  const allSubagents = [...existingSubagentConfigs, newSubagentConfig]

  // Rebuild graph.
  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow({
    name: existing.name,
    systemPrompt: existing.systemPrompt ?? "",
    steps,
    model: existing.model ?? DEFAULT_MODEL_SLUG,
    subagents: allSubagents,
  }, mcpConfigs)

  if (!existing.workflowId) return unprocessable("Agent has no linked workflow")
  const token = await resolveAccessToken(session.user.id)
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  const now = new Date()
  const subagentId = crypto.randomUUID()

  // Update nodeIds for existing subagents (their positions may have shifted).
  await Promise.all(
    existing.subagents.map((row, i) =>
      db.update(agentSubagents)
        .set({ nodeId: subagentNodeIds[i] ?? null })
        .where(eq(agentSubagents.id, row.id))
    )
  )

  await db.insert(agentSubagents).values({
    id: subagentId,
    agentId: id,
    name: newSubagentConfig.name,
    systemPrompt: newSubagentConfig.systemPrompt,
    model: newSubagentConfig.model,
    mcpIds: JSON.stringify(newSubagentConfig.mcpIds),
    datasetId: body.datasetId ?? null,
    nodeId: subagentNodeIds[existing.subagents.length] ?? null,
    createdAt: now,
  })

  await db.update(agents).set({ updatedAt: now }).where(eq(agents.id, id))

  const subagent = await db.query.agentSubagents.findFirst({
    where: (sa, { eq }) => eq(sa.id, subagentId),
  })

  return ok(subagent, 201)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!existing) return notFound("Agent not found")

  const parsed = await parseBody(request, subagentDeleteBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const subagentToRemove = existing.subagents.find((sa) => sa.id === body.subagentId)
  if (!subagentToRemove) return notFound("Subagent not found")

  const remainingSubagents: SubagentConfig[] = existing.subagents
    .filter((sa) => sa.id !== body.subagentId)
    .map((sa) => ({
      name: sa.name,
      description: "",
      systemPrompt: sa.systemPrompt,
      model: sa.model ?? DEFAULT_MODEL_SLUG,
      mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
    }))

  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow({
    name: existing.name,
    systemPrompt: existing.systemPrompt ?? "",
    steps,
    model: existing.model ?? DEFAULT_MODEL_SLUG,
    subagents: remainingSubagents,
  }, mcpConfigs)

  if (!existing.workflowId) return unprocessable("Agent has no linked workflow")
  const token = await resolveAccessToken(session.user.id)
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  await db.delete(agentSubagents).where(eq(agentSubagents.id, body.subagentId))

  // Update nodeIds for remaining subagents — positions shift after a delete.
  const remainingRows = existing.subagents.filter((sa) => sa.id !== body.subagentId)
  await Promise.all(
    remainingRows.map((row, i) =>
      db.update(agentSubagents)
        .set({ nodeId: subagentNodeIds[i] ?? null })
        .where(eq(agentSubagents.id, row.id))
    )
  )

  return new Response(null, { status: 204 })
}
