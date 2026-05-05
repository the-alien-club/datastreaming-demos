import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"
import { createWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { ok, unauthorized } from "@/lib/api-response"
import { createAgentBodySchema, parseBody } from "../_validators"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const [ownRows, publicRows] = await Promise.all([
    db.query.agents.findMany({
      where: eq(agents.userId, session.user.id),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
    db.query.agents.findMany({
      where: and(eq(agents.isPublic, true), ne(agents.userId, session.user.id)),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
  ])

  return ok([
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ])
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const parsed = await parseBody(request, createAgentBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const name = body.name.trim()
  const description = body.description ?? null
  const systemPrompt = body.systemPrompt
  const steps = body.steps
  const model = body.model ?? DEFAULT_MODEL_SLUG
  const subagentConfigs: SubagentConfig[] = body.subagents.map((sa) => ({
    name: sa.name,
    description: sa.description ?? "",
    systemPrompt: sa.systemPrompt,
    model: sa.model,
    mcpIds: sa.mcpIds,
  }))
  const starterPrompts = body.starterPrompts && body.starterPrompts.length > 0
    ? body.starterPrompts
    : null

  // Build workflow graph
  const mcpConfigs = await loadEnabledMcpConfigs(session.user.id)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow({
    name,
    systemPrompt,
    steps,
    model,
    subagents: subagentConfigs,
  }, mcpConfigs)

  const token = await resolveAccessToken(session.user.id)

  // Create workflow on platform
  const slug = `lds-agent-${crypto.randomUUID()}`
  const workflowResponse = await createWorkflow({
    name: `LDS Agent: ${name}`,
    slug,
    description: description ?? undefined,
    isPublic: false,
    type: "streaming",
    nodes,
    edges,
  }, token)

  // Persist to local DB
  const agentId = crypto.randomUUID()
  const now = new Date()

  await db.insert(agents).values({
    id: agentId,
    userId: session.user.id,
    workflowId: workflowResponse.id,
    name,
    description,
    systemPrompt,
    author: body.author?.trim() || null,
    steps: JSON.stringify(steps),
    starterPrompts: starterPrompts ? JSON.stringify(starterPrompts) : null,
    model,
    createdAt: now,
    updatedAt: now,
  })

  // Persist subagents (datasetId preserved if the caller passed one)
  if (body.subagents.length > 0) {
    await db.insert(agentSubagents).values(
      body.subagents.map((sa, i) => ({
        id: crypto.randomUUID(),
        agentId,
        name: sa.name,
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: JSON.stringify(sa.mcpIds),
        datasetId: sa.datasetId ?? null,
        nodeId: subagentNodeIds[i] ?? null,
        createdAt: now,
      }))
    )
  }

  const created = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, agentId), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })

  return ok(created, 201)
}
