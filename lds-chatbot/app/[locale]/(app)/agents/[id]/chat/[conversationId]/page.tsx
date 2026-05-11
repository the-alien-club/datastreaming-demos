import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { ConversationClient } from "./client"

interface ExistingChatPageProps {
  params: Promise<{ id: string; conversationId: string }>
}

export default async function ExistingChatPage({ params }: ExistingChatPageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const { id: agentId, conversationId } = await params

  // Load agent (scoped to caller).
  const agent = await prisma.agent.findFirst({
    where: { id: agentId },
  })
  if (!agent) notFound()

  // Load conversation with messages (scoped to caller).
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
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
    <ConversationClient
      agentId={agentId}
      agentName={agent.name}
      conversationId={conversationId}
      initialMessages={initialMessages}
    />
  )
}
