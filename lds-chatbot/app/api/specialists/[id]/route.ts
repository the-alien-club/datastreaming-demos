import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { specialists } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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
    where: (s, { eq }) => eq(s.id, id),
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
      model: body.model ?? "mistral-small-latest",
      mcpIds: body.mcpIds && body.mcpIds.length > 0 ? JSON.stringify(body.mcpIds) : null,
      updatedAt: new Date(),
    })
    .where(eq(specialists.id, id))

  const updated = await db.query.specialists.findFirst({
    where: (s, { eq }) => eq(s.id, id),
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

  await db.delete(specialists).where(eq(specialists.id, id))

  return new Response(null, { status: 204 })
}
