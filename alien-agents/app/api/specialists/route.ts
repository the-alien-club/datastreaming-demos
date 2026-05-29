import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { parseBody, specialistBodySchema, type SpecialistListResponse, type SpecialistRow } from "../_validators"
import { getSpecialists, getPublicSpecialists } from "@/models/specialists/queries"
import { SpecialistPolicy } from "@/models/specialists/policy"
import { createSpecialist } from "@/models/specialists/service"

export const GET = withAuth(async (_req, user) => {
  const [own, others] = await Promise.all([
    getSpecialists(user.id),
    getPublicSpecialists(user.id),
  ])
  return ok<SpecialistListResponse>([...own, ...others])
})

export const POST = withAuth(async (req, user, bouncer) => {
  const parsed = await parseBody(req, specialistBodySchema)
  if (parsed instanceof Response) return parsed
  await bouncer.with(SpecialistPolicy).authorize("create")
  const created = await createSpecialist(user.id, parsed)
  return ok<SpecialistRow>(created, 201)
})
