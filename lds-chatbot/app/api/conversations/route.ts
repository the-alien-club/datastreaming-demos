import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { eq, sql, desc } from "drizzle-orm"
import { ok, unauthorized } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  // Fetch the caller's conversations with agent info and message counts.
  const rows = await db
    .select({
      id: conversations.id,
      agentId: conversations.agentId,
      agentName: agents.name,
      title: conversations.title,
      sessionId: conversations.sessionId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`count(${messages.id})`.mapWith(Number),
    })
    .from(conversations)
    .leftJoin(agents, eq(conversations.agentId, agents.id))
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.userId, session.user.id))
    .groupBy(
      conversations.id,
      conversations.agentId,
      conversations.title,
      conversations.sessionId,
      conversations.createdAt,
      conversations.updatedAt,
      agents.name,
    )
    .orderBy(desc(conversations.updatedAt))

  return ok(rows)
}
