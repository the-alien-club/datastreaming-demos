import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { getAiModels } from "@/lib/platform/client"
import { resolveAccessToken } from "@/lib/auth-helpers"

// Cache the model list for 1 hour
let modelsCache: { data: Awaited<ReturnType<typeof getAiModels>>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  if (modelsCache && now - modelsCache.fetchedAt < CACHE_TTL_MS) {
    return Response.json(modelsCache.data)
  }

  const token = resolveAccessToken(session.user.id)
  const models = await getAiModels(token)
  modelsCache = { data: models, fetchedAt: now }

  return Response.json(models)
}
