import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { getAiModels } from "@/lib/platform/client"
import { getAgent } from "@/models/agents/queries"
import { getConversationsByAgent } from "@/models/conversations/service"
import { getSpecialists } from "@/models/specialists/queries"
import { getMcps } from "@/models/mcps/queries"
import { getDatasetsSummary } from "@/models/datasets/service"
import { AgentDetailClient, type AgentRecord } from "./client"
import type { DatasetRecord } from "../../datasets/client"
import type { ConversationRow } from "@/components/conversations-list-grouped"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const agent = await getAgent(id, session.user.id)
  if (!agent) notFound()

  const [models, specialists, mcpRows, datasetRows, conversationRows] = await Promise.all([
    resolveAccessToken(session.user.id)
      .then((token) => getAiModels(token))
      .catch(() => []),
    getSpecialists(session.user.id).catch(() => []),
    getMcps(session.user.id).catch(() => []),
    getDatasetsSummary(session.user.id).catch(() => []),
    getConversationsByAgent(id, session.user.id).catch(() => []),
  ])

  const initialAgent: AgentRecord = {
    id: agent.id,
    workflowId: agent.workflowId ?? null,
    name: agent.name,
    description: agent.description ?? null,
    author: agent.author ?? null,
    systemPrompt: agent.systemPrompt ?? null,
    steps: agent.steps ?? null,
    model: agent.model ?? null,
    isForkable: agent.isForkable,
    createdAt: agent.createdAt
      ? (agent.createdAt instanceof Date ? agent.createdAt.getTime() : agent.createdAt)
      : null,
    updatedAt: agent.updatedAt
      ? (agent.updatedAt instanceof Date ? agent.updatedAt.getTime() : agent.updatedAt)
      : null,
    subagents: agent.subagents.map((sa) => ({
      id: sa.id,
      agentId: sa.agentId,
      name: sa.name,
      systemPrompt: sa.systemPrompt,
      model: sa.model ?? null,
      mcpIds: sa.mcpIds ?? null,
      datasetId: sa.datasetId ?? null,
    })),
  }

  const initialLibrarySpecialists = specialists.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    systemPrompt: s.systemPrompt,
    model: s.model ?? null,
    mcpIds: s.mcpIds ?? null,
  }))

  const initialMcpList = mcpRows.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    categories: Array.isArray(m.categories) ? (m.categories as string[]) : null,
  }))

  const initialDatasets: DatasetRecord[] = datasetRows.map((r) => ({
    id: r.id,
    clusterDatasetId: r.clusterDatasetId,
    name: r.name,
    description: r.description ?? null,
    status: r.status ?? null,
    isPublic: r.isPublic ?? false,
    userId: r.userId,
    attachedAgentCount: r.attachedAgentCount,
    createdAt: r.createdAt
      ? (r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt)
      : null,
    updatedAt: r.updatedAt
      ? (r.updatedAt instanceof Date ? r.updatedAt.getTime() : r.updatedAt)
      : null,
    isOwn: r.isOwn,
  }))

  const initialConversationRows: ConversationRow[] = conversationRows.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    agentName: c.agentName ?? null,
    title: c.title ?? null,
    updatedAt: c.updatedAt ? (c.updatedAt instanceof Date ? c.updatedAt.getTime() : c.updatedAt) : null,
    messageCount: c.messageCount,
  }))

  return (
    <AgentDetailClient
      initialAgent={initialAgent}
      initialModels={models}
      initialLibrarySpecialists={initialLibrarySpecialists}
      initialMcpList={initialMcpList}
      initialDatasets={initialDatasets}
      initialConversationRows={initialConversationRows}
    />
  )
}
