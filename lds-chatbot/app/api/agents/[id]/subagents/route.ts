import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  let body: SubagentConfig
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.name || !body.systemPrompt) {
    return Response.json({ error: "name and systemPrompt are required" }, { status: 422 })
  }

  // Build new subagent list (existing + new)
  const existingSubagentConfigs: SubagentConfig[] = existing.subagents.map((sa) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? "gpt-4.1-mini",
    mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
  }))

  const newSubagentConfig: SubagentConfig = {
    name: body.name,
    description: body.description ?? "",
    systemPrompt: body.systemPrompt,
    model: body.model ?? "gpt-4.1-mini",
    mcpIds: body.mcpIds ?? [],
  }

  const allSubagents = [...existingSubagentConfigs, newSubagentConfig]

  // Rebuild graph
  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges } = buildAgentWorkflow({
    name: existing.name,
    systemPrompt: existing.systemPrompt ?? "",
    steps,
    model: existing.model ?? "gpt-4.1-mini",
    subagents: allSubagents,
  }, mcpConfigs)

  const token = await resolveAccessToken(session.user.id)
  if (!existing.workflowId) {
    return Response.json({ error: "Agent has no linked workflow" }, { status: 422 })
  }
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  // Persist new subagent
  const now = new Date()
  const subagentId = crypto.randomUUID()

  await db.insert(agentSubagents).values({
    id: subagentId,
    agentId: id,
    name: newSubagentConfig.name,
    systemPrompt: newSubagentConfig.systemPrompt,
    model: newSubagentConfig.model,
    mcpIds: JSON.stringify(newSubagentConfig.mcpIds),
    createdAt: now,
  })

  // Touch agent updatedAt
  await db
    .update(agents)
    .set({ updatedAt: now })
    .where(eq(agents.id, id))

  const subagent = await db.query.agentSubagents.findFirst({
    where: (sa, { eq }) => eq(sa.id, subagentId),
  })

  return Response.json(subagent, { status: 201 })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  let body: { subagentId: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.subagentId) {
    return Response.json({ error: "subagentId is required" }, { status: 422 })
  }

  const subagentToRemove = existing.subagents.find((sa) => sa.id === body.subagentId)
  if (!subagentToRemove) {
    return Response.json({ error: "Subagent not found" }, { status: 404 })
  }

  // Build remaining subagent configs
  const remainingSubagents: SubagentConfig[] = existing.subagents
    .filter((sa) => sa.id !== body.subagentId)
    .map((sa) => ({
      name: sa.name,
      description: "",
      systemPrompt: sa.systemPrompt,
      model: sa.model ?? "gpt-4.1-mini",
      mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
    }))

  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges } = buildAgentWorkflow({
    name: existing.name,
    systemPrompt: existing.systemPrompt ?? "",
    steps,
    model: existing.model ?? "gpt-4.1-mini",
    subagents: remainingSubagents,
  }, mcpConfigs)

  const token = await resolveAccessToken(session.user.id)
  if (!existing.workflowId) {
    return Response.json({ error: "Agent has no linked workflow" }, { status: 422 })
  }
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  await db
    .delete(agentSubagents)
    .where(eq(agentSubagents.id, body.subagentId))

  return new Response(null, { status: 204 })
}
