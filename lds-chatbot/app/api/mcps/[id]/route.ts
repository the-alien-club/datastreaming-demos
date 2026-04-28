import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { notFound, ok, unauthorized } from "@/lib/api-response"
import { parseBody, updateMcpBodySchema } from "../../_validators"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params
  const mcp = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!mcp) return notFound("MCP not found")

  return ok(mcp)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params
  const existing = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!existing) return notFound("MCP not found")

  const parsed = await parseBody(request, updateMcpBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

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
      isPublic: body.isPublic ?? existing.isPublic,
      updatedAt: new Date(),
    })
    .where(and(eq(mcps.id, id), eq(mcps.userId, session.user.id)))

  const updated = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  return ok(updated)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params
  const existing = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  if (!existing) return notFound("MCP not found")

  await db.delete(mcps).where(and(eq(mcps.id, id), eq(mcps.userId, session.user.id)))
  return new Response(null, { status: 204 })
}
