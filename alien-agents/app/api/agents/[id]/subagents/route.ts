import { withAuth } from "@/app/api/_middleware"
import { ok, notFound } from "@/lib/api-response"
import { parseBody, subagentCreateBodySchema, subagentDeleteBodySchema, type SubagentResponse } from "../../../_validators"
import { AgentPolicy } from "@/models/agents/policy"
import { getAgentById } from "@/models/agents/queries"
import { addSubagent, removeSubagent } from "@/models/agents/service"

export const POST = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const parsed = await parseBody(req, subagentCreateBodySchema)
  if (parsed instanceof Response) return parsed

  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("edit", agent)

  const subagent = await addSubagent(id, user.id, parsed)

  return ok<SubagentResponse>(subagent, 201)
})

export const DELETE = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const parsed = await parseBody(req, subagentDeleteBodySchema)
  if (parsed instanceof Response) return parsed

  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("edit", agent)

  await removeSubagent(id, user.id, parsed.subagentId)

  return new Response(null, { status: 204 })
})
