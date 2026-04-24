import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { createWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { loadEnabledMcpConfigs } from "@/lib/mcps"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await db.query.agents.findMany({
    orderBy: [desc(agents.createdAt)],
    with: { subagents: true },
  })

  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    name: string
    description?: string
    systemPrompt?: string
    steps?: { name: string; prompt: string }[]
    model?: string
    subagents?: SubagentConfig[]
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 422 })
  }

  const name = body.name.trim()
  const description = body.description ?? null
  const systemPrompt = body.systemPrompt ?? ""
  const steps = body.steps ?? []
  const model = body.model ?? "mistral-small-latest"
  const subagentConfigs: SubagentConfig[] = body.subagents ?? []

  // Build workflow graph
  const mcpConfigs = await loadEnabledMcpConfigs()
  const { nodes, edges } = buildAgentWorkflow({
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
    workflowId: workflowResponse.id,
    name,
    description,
    systemPrompt,
    steps: JSON.stringify(steps),
    model,
    createdAt: now,
    updatedAt: now,
  })

  // Persist subagents
  if (subagentConfigs.length > 0) {
    await db.insert(agentSubagents).values(
      subagentConfigs.map((sa) => ({
        id: crypto.randomUUID(),
        agentId,
        name: sa.name,
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: JSON.stringify(sa.mcpIds),
        createdAt: now,
      }))
    )
  }

  const created = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, agentId),
    with: { subagents: true },
  })

  return Response.json(created, { status: 201 })
}
