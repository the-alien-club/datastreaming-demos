import { withAuth } from "@/app/api/_middleware"
import { ok, notFound, badRequest } from "@/lib/api-response"
import { parseBody, forkSpecialistBodySchema, type ForkSpecialistResponse } from "@/app/api/_validators"
import { SpecialistPolicy } from "@/models/specialists/policy"
import { getSpecialistById } from "@/models/specialists/queries"
import { forkSpecialist } from "@/models/specialists/service"
import { ERR_NOT_FORKABLE } from "@/lib/constants"

export const POST = withAuth(async (req, user, bouncer, ctx) => {
  const { id } = await ctx.params

  const parsed = await parseBody(req, forkSpecialistBodySchema)
  if (parsed instanceof Response) return parsed

  const source = await getSpecialistById(id)
  if (!source) return notFound()

  await bouncer.with(SpecialistPolicy).authorize("view", source)
  await bouncer.with(SpecialistPolicy).authorize("fork")

  if (!source.isForkable) return badRequest(ERR_NOT_FORKABLE)

  const forked = await forkSpecialist(source, user.id, parsed.nameSuffix)

  return ok<ForkSpecialistResponse>({ id: forked.id, name: forked.name }, 201)
})
