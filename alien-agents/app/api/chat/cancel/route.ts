import { withAuth } from "@/app/api/_middleware"
import { notFound, ok } from "@/lib/api-response"
import { parseBody, cancelBodySchema, type CancelResponse } from "../../_validators"
import { AgentPolicy } from "@/models/agents/policy"
import { getAgentById } from "@/models/agents/queries"
import { cancelAgentResponse } from "@/models/agents/service"

export const dynamic = "force-dynamic"

export const POST = withAuth(async (req, user, bouncer) => {
  const parsed = await parseBody(req, cancelBodySchema)
  if (parsed instanceof Response) return parsed
  const { agentId, responseId } = parsed

  const agent = await getAgentById(agentId)
  if (!agent) return notFound()

  // Authorization: only the agent owner may cancel its running responses.
  // Without this check any authenticated user who knows an agentId and
  // responseId can terminate another user's in-flight workflow.
  await bouncer.with(AgentPolicy).authorize("edit", agent)

  const result = await cancelAgentResponse(agent, responseId, user.id)
  return ok<CancelResponse>(result)
})
