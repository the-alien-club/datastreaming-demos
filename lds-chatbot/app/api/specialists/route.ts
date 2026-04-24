import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { specialists } from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await db.query.specialists.findMany({
    orderBy: [desc(specialists.createdAt)],
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

  const now = new Date()
  const id = crypto.randomUUID()

  await db.insert(specialists).values({
    id,
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    systemPrompt: body.systemPrompt.trim(),
    model: body.model ?? "mistral-small-latest",
    mcpIds: body.mcpIds && body.mcpIds.length > 0 ? JSON.stringify(body.mcpIds) : null,
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.specialists.findFirst({
    where: (s, { eq }) => eq(s.id, id),
  })

  return Response.json(created, { status: 201 })
}
