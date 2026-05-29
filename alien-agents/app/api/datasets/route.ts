import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { createDataset, getDatasetsSummary } from "@/models/datasets/service"
import { parseBody, createDatasetBodySchema } from "../_validators"
import type { DatasetListResponse, DatasetRow } from "../_validators"

export const GET = withAuth(async (_req, user) => {
  const datasets = await getDatasetsSummary(user.id)
  return ok<DatasetListResponse>(datasets)
})

export const POST = withAuth(async (req, user, bouncer) => {
  const body = await parseBody(req, createDatasetBodySchema)
  if (body instanceof Response) return body

  await bouncer.with(DatasetPolicy).authorize("create")

  const created = await createDataset(user.id, body)
  return ok<DatasetRow>(created, 201)
})
