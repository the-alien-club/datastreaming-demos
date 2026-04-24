import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { datasets, agentSubagents, agents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  const subagentRows = await db
    .select({ agentId: agentSubagents.agentId, agentName: agents.name })
    .from(agentSubagents)
    .innerJoin(agents, eq(agentSubagents.agentId, agents.id))
    .where(eq(agentSubagents.datasetId, id))

  const seen = new Set<string>()
  const attachedAgents = subagentRows
    .filter((r) => { if (seen.has(r.agentId)) return false; seen.add(r.agentId); return true })
    .map((r) => ({ id: r.agentId, name: r.agentName }))

  return Response.json({ ...dataset, attachedAgents })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const existing = await db.query.datasets.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  })

  if (!existing) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  await db.delete(datasets).where(eq(datasets.id, id))

  return new Response(null, { status: 204 })
}
