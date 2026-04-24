import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await db.select().from(mcps).orderBy(desc(mcps.createdAt))
  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    name: string
    serverUrl: string
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

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 422 })
  }
  if (!body.serverUrl?.trim()) {
    return Response.json({ error: "serverUrl is required" }, { status: 422 })
  }

  const now = new Date()
  const id = crypto.randomUUID()

  await db.insert(mcps).values({
    id,
    name: body.name.trim(),
    serverUrl: body.serverUrl.trim(),
    transport: body.transport ?? "streamable_http",
    authToken: body.authToken ?? null,
    description: body.description ?? null,
    category: body.category ?? null,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.mcps.findFirst({ where: (m, { eq }) => eq(m.id, id) })
  return Response.json(created, { status: 201 })
}
