import { withAuth } from "@/app/api/_middleware"
import { getAgentById } from "@/models/agents/queries"
import { AgentPolicy } from "@/models/agents/policy"
import { getConversationsByAgent } from "@/models/conversations/service"
import { ok, notFound } from "@/lib/api-response"
import type { AgentConversationListItem } from "../../../_validators"

/**
 * GET /api/agents/:id/conversations
 *
 * Returns the calling user's conversations scoped to a single agent, with
 * message counts and timestamps. Used by the agent detail page to render
 * the per-assistant conversation history panel.
 *
 * 404 if the agent doesn't exist or the user is not allowed to view it.
 */
export const GET = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const agent = await getAgentById(id)
  if (!agent) return notFound()
  await bouncer.with(AgentPolicy).authorize("view", agent)
  const rows = await getConversationsByAgent(id, user.id)
  return ok<AgentConversationListItem[]>(
    rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      title: r.title,
      updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
      messageCount: r.messageCount,
    })),
  )
})
