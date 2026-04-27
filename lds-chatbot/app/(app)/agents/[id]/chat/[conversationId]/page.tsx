import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { agents, conversations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { ExistingChatClient } from "./existing-chat-client"

interface ExistingChatPageProps {
  params: Promise<{ id: string; conversationId: string }>
}

export default async function ExistingChatPage({ params }: ExistingChatPageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const { id: agentId, conversationId } = await params

  // Load agent (scoped to caller).
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.userId, session.user.id)),
  })
  if (!agent) notFound()

  // Load conversation with messages (scoped to caller).
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.userId, session.user.id)),
    with: {
      messages: {
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  })

  if (!conversation || conversation.agentId !== agentId) notFound()

  // Convert DB messages to UIMessage format. Assistant rows written since
  // the parts-jsonb migration carry the full structured stream (text +
  // tool-call chips + subagent panels) so a refreshed tab replays the
  // same rich rendering it had during the live stream. Older rows (and
  // every user message) fall back to a single text part built from the
  // plain `content` column.
  const initialMessages = conversation.messages.map((msg) => {
    const role = msg.role as "user" | "assistant"
    if (role === "assistant" && Array.isArray(msg.parts) && msg.parts.length > 0) {
      return {
        id: msg.id,
        role,
        parts: msg.parts as Array<{ type: string } & Record<string, unknown>>,
      }
    }
    return {
      id: msg.id,
      role,
      parts: [{ type: "text" as const, text: msg.content }],
    }
  })

  return (
    <ExistingChatClient
      agentId={agentId}
      agentName={agent.name}
      conversationId={conversationId}
      initialMessages={initialMessages}
    />
  )
}
