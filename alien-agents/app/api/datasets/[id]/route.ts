import { withAuth } from "@/app/api/_middleware"
import { ok, notFound } from "@/lib/api-response"
import { DatasetPolicy } from "@/models/datasets/policy"
import { getDatasetById, updateDatasetRecord, deleteDatasetRecord } from "@/models/datasets/queries"
import { getDatasetDetail } from "@/models/datasets/service"
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

export const PATCH = withAuth(async (req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("edit", dataset)

  const body = await parseBody(req, updateDatasetBodySchema)
  if (body instanceof Response) return body

  const updates: Partial<{ name: string; description: string | null; isPublic: boolean }> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if ("description" in body) updates.description = body.description ?? null
  if (body.isPublic !== undefined) updates.isPublic = body.isPublic

  const updated = await updateDatasetRecord(id, updates)
  if (!updated) return notFound()
  return ok<DatasetRow>(updated)
})

export const DELETE = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const dataset = await getDatasetById(id)
  if (!dataset) return notFound()
  await bouncer.with(DatasetPolicy).authorize("delete", dataset)

  await deleteDatasetRecord(id)
  return new Response(null, { status: 204 })
})
