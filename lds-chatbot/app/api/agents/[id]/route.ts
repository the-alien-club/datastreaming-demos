import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { deleteWorkflow, updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { ok, notFound, unauthorized, unprocessable } from "@/lib/api-response"
import { parseBody, updateAgentBodySchema, patchVisibilityBodySchema } from "../../_validators"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const agent = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, id),
    with: { subagents: true },
  })

  if (!agent) {
    // 404 (not 403) on missing: don't disclose existence of other users'
    // resources to a potential attacker probing for IDs.
    return notFound("Agent not found")
  }

  const isOwner = agent.userId === session.user.id

  // Non-owners can only read public agents, and only the chat-relevant
  // fields (name, description, starter prompts, model). Internals like
  // `systemPrompt`, subagent configs, and `workflowId` are owner-only.
  if (!isOwner) {
    if (!agent.isPublic) return notFound("Agent not found")
    return ok({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      isPublic: agent.isPublic,
      starterPrompts: agent.starterPrompts ? JSON.parse(agent.starterPrompts) : [],
    })
  }

  return ok({
    ...agent,
    starterPrompts: agent.starterPrompts ? JSON.parse(agent.starterPrompts) : [],
  })
}

// Track datasetId alongside the workflow-graph SubagentConfig so we can
// preserve corpus attachments on round-trip writes (the graph builder
// doesn't need datasetId — but the persistence layer does).
type SubagentConfigWithDataset = SubagentConfig & { datasetId: string | null }

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!existing) return notFound("Agent not found")

  // PUT is full-replace. The validator enforces that name, model,
  // systemPrompt, steps, and subagents are all present and well-shaped;
  // a stringified array (`steps: "[]"`) or a missing `subagents` field
  // is rejected at parse time with 400 + zod issues. No defensive
  // coercion in this handler — that masked client bugs and silently
  // wiped subagents on incomplete payloads.
  const parsed = await parseBody(request, updateAgentBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const name = body.name.trim()
  const description = "description" in body ? (body.description ?? null) : existing.description
  const author = "author" in body ? (body.author?.trim() || null) : existing.author
  const systemPrompt = body.systemPrompt
  const steps = body.steps
  const model = body.model
  // `starterPrompts` is the one optional field — the edit form doesn't
  // always include it, and the create flow seeds them separately. If
  // omitted, preserve existing; if provided, replace (filtering blanks).
  const parsedStarterPrompts: string[] | null =
    body.starterPrompts !== undefined
      ? (() => {
          const cleaned = body.starterPrompts.filter((p) => p.trim() !== "")
          return cleaned.length > 0 ? cleaned : null
        })()
      : existing.starterPrompts
        ? (JSON.parse(existing.starterPrompts) as string[])
        : null

  const subagentConfigs: SubagentConfigWithDataset[] = body.subagents.map((sa) => ({
    name: sa.name,
    description: sa.description ?? "",
    systemPrompt: sa.systemPrompt,
    model: sa.model,
    mcpIds: sa.mcpIds,
    datasetId: sa.datasetId ?? null,
  }))

  // Rebuild workflow graph from the full-replace payload.
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow({
    name,
    systemPrompt,
    steps,
    model,
    subagents: subagentConfigs,
  }, mcpConfigs)

  const token = await resolveAccessToken(session.user.id)

  // Patch workflow on platform.
  if (!existing.workflowId) {
    return unprocessable("Agent has no linked workflow")
  }
  await updateWorkflow(existing.workflowId, { nodes, edges, name: `LDS Agent: ${name}` }, token)

  const now = new Date()

  await db
    .update(agents)
    .set({
      name,
      description,
      author,
      systemPrompt,
      steps: JSON.stringify(steps),
      starterPrompts: parsedStarterPrompts ? JSON.stringify(parsedStarterPrompts) : null,
      model,
      updatedAt: now,
    })
    .where(and(eq(agents.id, id), eq(agents.userId, session.user.id)))

  // Replace subagents wholesale: delete-then-insert with datasetId preserved.
  await db.delete(agentSubagents).where(eq(agentSubagents.agentId, id))
  if (subagentConfigs.length > 0) {
    await db.insert(agentSubagents).values(
      subagentConfigs.map((sa, i) => ({
        id: crypto.randomUUID(),
        agentId: id,
        name: sa.name,
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: JSON.stringify(sa.mcpIds),
        datasetId: sa.datasetId,
        nodeId: subagentNodeIds[i] ?? null,
        createdAt: now,
      })),
    )
  }

  const updated = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  if (!updated) {
    return Response.json({ error: { message: "Agent not found after update" } }, { status: 500 })
  }

  return ok({
    ...updated,
    starterPrompts: updated.starterPrompts ? JSON.parse(updated.starterPrompts) : [],
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params
  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
  })
  if (!existing) return notFound("Agent not found")

  const parsed = await parseBody(request, patchVisibilityBodySchema)
  if (parsed instanceof Response) return parsed

  await db
    .update(agents)
    .set({ isPublic: parsed.isPublic, updatedAt: new Date() })
    .where(and(eq(agents.id, id), eq(agents.userId, session.user.id)))

  const updated = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })
  if (!updated) return notFound("Agent not found")
  return ok({ ...updated, starterPrompts: updated.starterPrompts ? JSON.parse(updated.starterPrompts) : [] })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
  })

  if (!existing) return notFound("Agent not found")

  if (existing.workflowId) {
    const token = await resolveAccessToken(session.user.id)
    await deleteWorkflow(existing.workflowId, token)
  }

  // Cascade delete handled by FK constraint (subagents, conversations).
  await db.delete(agents).where(and(eq(agents.id, id), eq(agents.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
