import { withAuth } from "@/app/api/_middleware"
import { ok, notFound } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { getDatasetById, deleteDatasetRecord } from "@/models/datasets/queries"
import { getDatasetDetail, updateDataset, DatasetNotFoundError } from "@/models/datasets/service"
import { parseBody, updateDatasetBodySchema } from "../../_validators"
import type { DatasetDetailResponse, DatasetRow } from "../../_validators"

export const GET = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("view", dataset)

  const detail = await getDatasetDetail(id, user.id)
  if (!detail) return notFound()
  return ok<DatasetDetailResponse>(detail)
})

export const PATCH = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("edit", dataset)

  const body = await parseBody(req, updateDatasetBodySchema)
  if (body instanceof Response) return body

  try {
    const updated = await updateDataset(id, user.id, body)
    return ok<DatasetRow>(updated)
  } catch (e) {
    if (e instanceof DatasetNotFoundError) return notFound()
    throw e
  }
})

export const DELETE = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("delete", dataset)

  await deleteDatasetRecord(id)
  return new Response(null, { status: 204 })
})
