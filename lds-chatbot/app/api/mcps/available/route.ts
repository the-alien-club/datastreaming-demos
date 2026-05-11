import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { type AvailableMcpsResponse } from "../../_validators"
import { getAvailableMcps } from "@/models/mcps/service"

export const GET = withAuth(async (_req, user) => {
  const available = await getAvailableMcps(user.id)
  return ok<AvailableMcpsResponse>(available)
})
