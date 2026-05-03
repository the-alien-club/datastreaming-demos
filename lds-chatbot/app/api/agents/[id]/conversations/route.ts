import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { and, eq, desc, sql } from "drizzle-orm"
import { ok, notFound, unauthorized } from "@/lib/api-response"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/agents/:id/conversations
 *
 * Returns the calling user's conversations scoped to a single agent, with
 * message counts and timestamps. Used by the agent detail page to render
 * the per-assistant conversation history panel.
 *
 * 404 if the agent doesn't exist for the current user — keeps the URL
 * surface symmetric with `/api/agents/:id`.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const agent = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    columns: { id: true },
  })
  if (!agent) return notFound("Agent not found")

  const rows = await db
    .select({
      id: conversations.id,
      agentId: conversations.agentId,
      agentName: agents.name,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`count(${messages.id})`.mapWith(Number),
    })
    .from(conversations)
    .leftJoin(agents, eq(conversations.agentId, agents.id))
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.userId, session.user.id),
        eq(conversations.agentId, id),
      ),
    )
    .groupBy(
      conversations.id,
      conversations.agentId,
      conversations.title,
      conversations.updatedAt,
      agents.name,
    )
    .orderBy(desc(conversations.updatedAt))

  return ok(
    rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      title: r.title,
      updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
      messageCount: r.messageCount,
    })),
  )
}
