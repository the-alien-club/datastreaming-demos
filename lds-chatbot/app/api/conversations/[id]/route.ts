import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { conversations, messages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
    with: {
      messages: {
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  })

  if (!conversation) {
    return new Response("Not found", { status: 404 })
  }

  return NextResponse.json(conversation)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  // Messages cascade-delete via FK constraint
  await db.delete(conversations).where(eq(conversations.id, id))

  return new Response(null, { status: 204 })
}
