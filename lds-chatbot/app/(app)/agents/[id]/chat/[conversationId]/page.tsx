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

  // Convert DB messages to UIMessage format (parts-based)
  const initialMessages = conversation.messages.map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: msg.content }],
  }))

  return (
    <ExistingChatClient
      agentId={agentId}
      agentName={agent.name}
      conversationId={conversationId}
      initialMessages={initialMessages}
    />
  )
}
