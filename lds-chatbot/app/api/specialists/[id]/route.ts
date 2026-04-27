import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { specialists } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const row = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  return Response.json(row)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership before applying any update.
  const existing = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  let body: {
    name: string
    description?: string | null
    systemPrompt: string
    model?: string
    mcpIds?: string[]
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 422 })
  }
  if (!body.systemPrompt || typeof body.systemPrompt !== "string" || body.systemPrompt.trim() === "") {
    return Response.json({ error: "systemPrompt is required" }, { status: 422 })
  }

  await db
    .update(specialists)
    .set({
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      systemPrompt: body.systemPrompt.trim(),
      model: body.model ?? "gpt-4.1-mini",
      mcpIds: body.mcpIds && body.mcpIds.length > 0 ? JSON.stringify(body.mcpIds) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(specialists.id, id), eq(specialists.userId, session.user.id)))

  const updated = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  return Response.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const existing = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  await db
    .delete(specialists)
    .where(and(eq(specialists.id, id), eq(specialists.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
