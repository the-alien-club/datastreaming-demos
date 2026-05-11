import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { getAvailableLlms } from "@/models/ai-models/service"
import type { AiModelResponse } from "../_validators"

export const GET = withAuth(async (_req, user) => {
  const models = await getAvailableLlms(user.id)
  return ok<AiModelResponse>(models)
})
