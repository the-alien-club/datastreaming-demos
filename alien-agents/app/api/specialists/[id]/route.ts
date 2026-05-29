import { withAuth } from "@/app/api/_middleware"
import { getSpecialistById } from "@/models/specialists/queries"
import { SpecialistPolicy } from "@/models/specialists/policy"
import { updateSpecialist, publishSpecialist, deleteSpecialist } from "@/models/specialists/service"
import { ok, notFound } from "@/lib/api-response"
import { parseBody, specialistBodySchema, type SpecialistRow } from "../../_validators"
import { patchVisibilityBodySchema } from "@/models/specialists/types"

/**
 * GET /api/specialists/:id
 *
 * Returns the specialist. Owners and any user when the specialist is public.
 */
export const GET = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const specialist = await getSpecialistById(id)
  if (!specialist) return notFound()
  await bouncer.with(SpecialistPolicy).authorize("view", specialist)
  return ok<SpecialistRow>(specialist)
})

/**
 * PUT /api/specialists/:id
 *
 * Full-replace update of a specialist. Only the owner may edit.
 */
export const PUT = withAuth(async (req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const specialist = await getSpecialistById(id)
  if (!specialist) return notFound()
  await bouncer.with(SpecialistPolicy).authorize("edit", specialist)
  const parsed = await parseBody(req, specialistBodySchema)
  if (parsed instanceof Response) return parsed
  const updated = await updateSpecialist(id, parsed)
  return ok<SpecialistRow>(updated)
})

/**
 * PATCH /api/specialists/:id
 *
 * Toggles the specialist's public visibility. Only the owner may publish.
 */
export const PATCH = withAuth(async (req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const specialist = await getSpecialistById(id)
  if (!specialist) return notFound()
  await bouncer.with(SpecialistPolicy).authorize("publish", specialist)
  const parsed = await parseBody(req, patchVisibilityBodySchema)
  if (parsed instanceof Response) return parsed
  const updated = await publishSpecialist(id, parsed.isPublic)
  return ok<SpecialistRow>(updated)
})

/**
 * DELETE /api/specialists/:id
 *
 * Deletes the specialist. Only the owner may delete.
 */
export const DELETE = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const specialist = await getSpecialistById(id)
  if (!specialist) return notFound()
  await bouncer.with(SpecialistPolicy).authorize("delete", specialist)
  await deleteSpecialist(id)
  return new Response(null, { status: 204 })
})
