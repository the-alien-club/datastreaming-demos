import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { specialists } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { ok, unauthorized } from "@/lib/api-response"
import { parseBody, specialistBodySchema } from "../_validators"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const rows = await db.query.specialists.findMany({
    where: eq(specialists.userId, session.user.id),
    orderBy: [desc(specialists.createdAt)],
  })

  return ok(rows)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const parsed = await parseBody(request, specialistBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const now = new Date()
  const id = crypto.randomUUID()

  await db.insert(specialists).values({
    id,
    userId: session.user.id,
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    systemPrompt: body.systemPrompt.trim(),
    model: body.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: body.mcpIds && body.mcpIds.length > 0 ? JSON.stringify(body.mcpIds) : null,
    createdAt: now,
    updatedAt: now,
  })

  const created = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })

  return ok(created, 201)
}
