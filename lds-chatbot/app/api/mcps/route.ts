import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"
import { ok, unauthorized } from "@/lib/api-response"
import { createMcpBodySchema, parseBody } from "../_validators"
import { DEFAULT_MCP_TRANSPORT } from "@/lib/constants"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const [ownRows, publicRows] = await Promise.all([
    db.select().from(mcps).where(eq(mcps.userId, session.user.id)).orderBy(desc(mcps.createdAt)),
    db.select().from(mcps).where(and(eq(mcps.isPublic, true), ne(mcps.userId, session.user.id))).orderBy(desc(mcps.createdAt)),
  ])

  return ok([
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ])
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const parsed = await parseBody(request, createMcpBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const now = new Date()
  const id = crypto.randomUUID()

  await db.insert(mcps).values({
    id,
    userId: session.user.id,
    name: body.name.trim(),
    serverUrl: body.serverUrl.trim(),
    transport: body.transport ?? DEFAULT_MCP_TRANSPORT,
    authToken: body.authToken ?? null,
    description: body.description ?? null,
    category: body.category ?? null,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.mcps.findFirst({
    where: (m, { eq, and }) => and(eq(m.id, id), eq(m.userId, session.user.id)),
  })
  return ok(created, 201)
}
