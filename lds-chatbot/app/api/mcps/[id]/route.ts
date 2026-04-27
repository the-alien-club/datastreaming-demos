import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const mcp = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!mcp) return Response.json({ error: "MCP not found" }, { status: 404 })

  return Response.json(mcp)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const existing = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!existing) return Response.json({ error: "MCP not found" }, { status: 404 })

  let body: {
    name?: string
    serverUrl?: string
    transport?: string
    authToken?: string | null
    description?: string | null
    category?: string | null
    enabled?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  await db
    .update(mcps)
    .set({
      name: body.name?.trim() ?? existing.name,
      serverUrl: body.serverUrl?.trim() ?? existing.serverUrl,
      transport: body.transport ?? existing.transport,
      authToken: "authToken" in body ? (body.authToken ?? null) : existing.authToken,
      description: "description" in body ? (body.description ?? null) : existing.description,
      category: "category" in body ? (body.category ?? null) : existing.category,
      enabled: body.enabled ?? existing.enabled,
      updatedAt: new Date(),
    })
    .where(and(eq(mcps.id, id), eq(mcps.userId, session.user.id)))

  const updated = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  return Response.json(updated)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const existing = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!existing) return Response.json({ error: "MCP not found" }, { status: 404 })

  await db.delete(mcps).where(and(eq(mcps.id, id), eq(mcps.userId, session.user.id)))
  return new Response(null, { status: 204 })
}
