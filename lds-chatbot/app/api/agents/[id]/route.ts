import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { deleteWorkflow, updateWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const agent = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, id),
    with: { subagents: true },
  })

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  return Response.json(agent)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, id),
    with: { subagents: true },
  })

  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  // Body may arrive with `steps` and `subagents[].mcpIds` as either:
  //   - already-parsed arrays (the typical UI flow), or
  //   - JSON-encoded strings (a client that round-trips the GET response,
  //     where these fields are stored as JSON text in SQLite).
  // We coerce to arrays here and validate; never trust `.map()` on raw input.
  let body: {
    name?: string
    description?: string
    systemPrompt?: string
    steps?: { name: string; prompt: string }[] | string
    model?: string
    subagents?: (Omit<SubagentConfig, "mcpIds"> & { mcpIds: string[] | string })[]
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  function coerceArray<T>(value: unknown, fieldName: string): T[] {
    if (value === undefined || value === null) return []
    if (Array.isArray(value)) return value as T[]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed === "") return []
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        throw new Error(
          `${fieldName} must be an array or valid JSON array string`,
        )
      }
      if (!Array.isArray(parsed)) {
        throw new Error(`${fieldName} must be an array`)
      }
      return parsed as T[]
    }
    throw new Error(`${fieldName} must be an array (got: ${typeof value})`)
  }

  let parsedSteps: { name: string; prompt: string }[]
  try {
    parsedSteps = body.steps !== undefined
      ? coerceArray<{ name: string; prompt: string }>(body.steps, "steps")
      : (existing.steps ? JSON.parse(existing.steps) : [])
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid steps" },
      { status: 400 },
    )
  }

  const name = body.name?.trim() ?? existing.name
  const description = "description" in body ? (body.description ?? null) : existing.description
  const systemPrompt = body.systemPrompt ?? existing.systemPrompt ?? ""
  const steps = parsedSteps
  const model = body.model ?? existing.model ?? "gpt-4.1-mini"

  let subagentConfigs: SubagentConfig[]
  try {
    if (body.subagents !== undefined) {
      const rawSubagents = coerceArray<{
        name: string
        description?: string
        systemPrompt: string
        model: string
        mcpIds: string[] | string
      }>(body.subagents, "subagents")
      subagentConfigs = rawSubagents.map((sa, idx) => ({
        name: sa.name,
        description: sa.description ?? "",
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: coerceArray<string>(sa.mcpIds, `subagents[${idx}].mcpIds`),
      }))
    } else {
      subagentConfigs = existing.subagents.map((sa) => ({
        name: sa.name,
        description: "",
        systemPrompt: sa.systemPrompt,
        model: sa.model ?? "gpt-4.1-mini",
        mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
      }))
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid subagents" },
      { status: 400 },
    )
  }

  // Rebuild workflow graph from merged config
  const mcpConfigs = await loadEnabledMcpConfigs()
  const { nodes, edges } = buildAgentWorkflow({
    name,
    systemPrompt,
    steps,
    model,
    subagents: subagentConfigs,
  }, mcpConfigs)

  const token = await resolveAccessToken(session.user.id)

  // Patch workflow on platform
  if (!existing.workflowId) {
    return Response.json({ error: "Agent has no linked workflow" }, { status: 422 })
  }
  await updateWorkflow(existing.workflowId, { nodes, edges, name: `LDS Agent: ${name}` }, token)

  const now = new Date()

  // Update agent row
  await db
    .update(agents)
    .set({
      name,
      description,
      systemPrompt,
      steps: JSON.stringify(steps),
      model,
      updatedAt: now,
    })
    .where(eq(agents.id, id))

  // Replace subagents: delete all then re-insert
  if (body.subagents !== undefined) {
    await db.delete(agentSubagents).where(eq(agentSubagents.agentId, id))

    if (subagentConfigs.length > 0) {
      await db.insert(agentSubagents).values(
        subagentConfigs.map((sa) => ({
          id: crypto.randomUUID(),
          agentId: id,
          name: sa.name,
          systemPrompt: sa.systemPrompt,
          model: sa.model,
          mcpIds: JSON.stringify(sa.mcpIds),
          createdAt: now,
        }))
      )
    }
  }

  const updated = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, id),
    with: { subagents: true },
  })

  return Response.json(updated)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, id),
  })

  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 })
  }

  if (existing.workflowId) {
    const token = await resolveAccessToken(session.user.id)
    await deleteWorkflow(existing.workflowId, token)
  }

  // Cascade delete handled by FK constraint (subagents, conversations)
  await db.delete(agents).where(eq(agents.id, id))

  return new Response(null, { status: 204 })
}
