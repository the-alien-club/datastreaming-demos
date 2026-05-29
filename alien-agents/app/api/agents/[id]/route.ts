import { withAuth } from "@/app/api/_middleware"
import { ok, notFound, err } from "@/lib/api-response"
import { parseBody, updateAgentBodySchema, patchVisibilityBodySchema, type AgentResponse, type AgentPublicResponse } from "../../_validators"
import { AgentPolicy } from "@/models/agents/policy"
import { getAgentById } from "@/models/agents/queries"
import { updateAgent, deleteAgent, patchAgentVisibility, AgentWorkflowNotFoundError } from "@/models/agents/service"

export const GET = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("view", agent)

  // Shape selector only — not an auth check.
  // Ownership enforcement is already done by AgentPolicy.view() above.
  // This branch picks the response shape: owners get the full record,
  // others get the public subset. If ownership rules ever change,
  // update AgentPolicy — this comparison must stay in sync.
  if (agent.userId !== user.id) {
    return ok<AgentPublicResponse>({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      isPublic: agent.isPublic,
      starterPrompts: agent.starterPrompts ? JSON.parse(agent.starterPrompts) : [],
    })
  }

  return ok<AgentResponse>({
    ...agent,
    starterPrompts: agent.starterPrompts ? JSON.parse(agent.starterPrompts) : [],
  })
})

export const PUT = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const parsed = await parseBody(req, updateAgentBodySchema)
  if (parsed instanceof Response) return parsed

  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("edit", agent)

  try {
    const updated = await updateAgent(id, user.id, parsed)
    return ok<AgentResponse>({
      ...updated,
      starterPrompts: updated.starterPrompts ? JSON.parse(updated.starterPrompts) : [],
    })
  } catch (e) {
    if (e instanceof AgentWorkflowNotFoundError) return err(e.message, 409)
    throw e
  }
})

export const PATCH = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const parsed = await parseBody(req, patchVisibilityBodySchema)
  if (parsed instanceof Response) return parsed

  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("publish", agent)

  const updated = await patchAgentVisibility(id, user.id, parsed.isPublic)

  return ok<AgentResponse>({
    ...updated,
    starterPrompts: updated.starterPrompts ? JSON.parse(updated.starterPrompts) : [],
  })
})

export const DELETE = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const agent = await getAgentById(id)
  if (!agent) return notFound()

  await bouncer.with(AgentPolicy).authorize("delete", agent)

  await deleteAgent(id, user.id)

  return new Response(null, { status: 204 })
})
