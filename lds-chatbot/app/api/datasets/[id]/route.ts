import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { datasets, agentSubagents, agents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const dataset = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })

  if (!dataset) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  // Joining on agents.userId too: defence in depth — even if a stray subagent
  // row points at this dataset from another user's agent (shouldn't be
  // possible after this migration), we never leak that user's agent name.
  const subagentRows = await db
    .selectDistinct({ agentId: agentSubagents.agentId, agentName: agents.name })
    .from(agentSubagents)
    .innerJoin(agents, eq(agentSubagents.agentId, agents.id))
    .where(and(eq(agentSubagents.datasetId, id), eq(agents.userId, session.user.id)))

  const attachedAgents = subagentRows.map((r) => ({ id: r.agentId, name: r.agentName }))

  return Response.json({ ...dataset, attachedAgents })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const existing = await db.query.datasets.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.userId, session.user.id)),
  })

  if (!existing) {
    return Response.json({ error: "Dataset not found" }, { status: 404 })
  }

  await db.delete(datasets).where(and(eq(datasets.id, id), eq(datasets.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
