import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { specialists } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { ok, notFound, unauthorized } from "@/lib/api-response"
import { parseBody, specialistBodySchema } from "../../_validators"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await params
  const row = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })

  if (!row) return notFound()

  return ok(row)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await params

  const existing = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })
  if (!existing) return notFound()

  const parsed = await parseBody(request, specialistBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  await db
    .update(specialists)
    .set({
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      systemPrompt: body.systemPrompt.trim(),
      model: body.model ?? DEFAULT_MODEL_SLUG,
      mcpIds: body.mcpIds && body.mcpIds.length > 0 ? JSON.stringify(body.mcpIds) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(specialists.id, id), eq(specialists.userId, session.user.id)))

  const updated = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })

  if (!updated) return notFound()

  return ok(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await params

  const existing = await db.query.specialists.findFirst({
    where: (s, { eq, and }) => and(eq(s.id, id), eq(s.userId, session.user.id)),
  })
  if (!existing) return notFound()

  await db
    .delete(specialists)
    .where(and(eq(specialists.id, id), eq(specialists.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
