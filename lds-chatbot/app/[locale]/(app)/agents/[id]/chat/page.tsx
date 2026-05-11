import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { getAgent } from "@/models/agents/queries"
import { AgentChatClient } from "./client"

interface AgentChatPageProps {
  params: Promise<{ id: string }>
}

export default async function AgentChatPage({ params }: AgentChatPageProps) {
  const { id: agentId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const agent = await getAgent(agentId, session.user.id)
  if (!agent) notFound()

  return <AgentChatClient agentId={agentId} initialAgentName={agent.name} />
}
