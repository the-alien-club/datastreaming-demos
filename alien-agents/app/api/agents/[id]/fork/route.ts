import { withAuth } from "@/app/api/_middleware"
import { ok, notFound, badRequest } from "@/lib/api-response"
import { parseBody, forkAgentBodySchema, type ForkAgentResponse } from "../../../_validators"
import { AgentPolicy } from "@/models/agents/policy"
import { getAgentById } from "@/models/agents/queries"
import { forkAgent } from "@/models/agents/service"
import { ERR_NOT_FORKABLE } from "@/lib/constants"

export const POST = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params

  const parsed = await parseBody(req, forkAgentBodySchema)
  if (parsed instanceof Response) return parsed

  const source = await getAgentById(id)
  if (!source) return notFound()

  // Two separate authorization checks:
  // 1. Can the caller see this agent? (must be public or owned)
  await bouncer.with(AgentPolicy).authorize("view", source)
  // 2. Is the caller allowed to fork (non-client org role)?
  await bouncer.with(AgentPolicy).authorize("fork")

  if (!source.isForkable) return badRequest(ERR_NOT_FORKABLE)

  const forked = await forkAgent(source, user.id, parsed.nameSuffix)

  return ok<ForkAgentResponse>({ id: forked.id, name: forked.name }, 201)
})
