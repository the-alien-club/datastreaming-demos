import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { conversations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { ok, notFound, unauthorized } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await params

  const conversation = await db.query.conversations.findFirst({
    where: (c, { eq, and }) => and(eq(c.id, id), eq(c.userId, session.user.id)),
    with: {
      messages: {
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  })

  if (!conversation) return notFound()

  return ok(conversation)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await params

  const existing = await db.query.conversations.findFirst({
    where: (c, { eq, and }) => and(eq(c.id, id), eq(c.userId, session.user.id)),
  })
  if (!existing) return notFound()

  // Messages cascade-delete via FK constraint.
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
