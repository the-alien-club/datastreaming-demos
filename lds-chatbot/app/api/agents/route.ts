import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { parseBody, createAgentBodySchema, type AgentListResponse, type AgentResponse } from "../_validators"
import { AgentPolicy } from "@/models/agents/policy"
import { getAgents, getPublicAgents } from "@/models/agents/queries"
import { createAgent } from "@/models/agents/service"

export const GET = withAuth(async (_req, user) => {
  const [ownRows, publicRows] = await Promise.all([
    getAgents(user.id),
    getPublicAgents(user.id),
  ])

  return ok<AgentListResponse>([
    ...ownRows.map((r) => ({ ...r, starterPrompts: r.starterPrompts ? JSON.parse(r.starterPrompts) : [], isOwn: true })),
    ...publicRows.map((r) => ({ ...r, starterPrompts: r.starterPrompts ? JSON.parse(r.starterPrompts) : [], isOwn: false })),
  ])
})

export const POST = withAuth(async (req, user, bouncer) => {
  const parsed = await parseBody(req, createAgentBodySchema)
  if (parsed instanceof Response) return parsed

  await bouncer.with(AgentPolicy).authorize("create")

  const created = await createAgent(user.id, parsed)

  return ok<AgentResponse>(
    { ...created, starterPrompts: created.starterPrompts ? JSON.parse(created.starterPrompts) : [] },
    201,
  )
})
