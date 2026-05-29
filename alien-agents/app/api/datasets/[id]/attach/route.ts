import { withAuth } from "@/app/api/_middleware"
import { ok, notFound, unprocessable, conflict } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { getDatasetById } from "@/models/datasets/queries"
import {
  attachDatasetToAgent,
  DatasetNotSyncedError,
  DatasetAlreadyAttachedError,
  AgentNotFoundError,
  AgentNoWorkflowError,
} from "@/models/datasets/service"
import { parseBody, datasetAttachBodySchema } from "../../../_validators"
import type { DatasetAttachResponse } from "../../../_validators"

export const POST = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const body = await parseBody(req, datasetAttachBodySchema)
  if (body instanceof Response) return body

  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("attach", dataset)

  try {
    const result = await attachDatasetToAgent(id, body.agentId, user.id)
    return ok<DatasetAttachResponse>(result, 201)
  } catch (e) {
    if (e instanceof DatasetNotSyncedError) return unprocessable(e.message)
    if (e instanceof DatasetAlreadyAttachedError) return conflict(e.message)
    if (e instanceof AgentNotFoundError) return notFound(e.message)
    if (e instanceof AgentNoWorkflowError) return unprocessable(e.message)
    throw e
  }
})
