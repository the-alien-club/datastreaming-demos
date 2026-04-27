import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { getAiModels } from "@/lib/platform/client"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { ok, unauthorized } from "@/lib/api-response"

// `select=public` returns the platform's curated public catalogue, so
// the cache is shared safely across users. If the upstream URL ever
// changes (e.g. to `select=mine`), drop this cache or key it by user.
let modelsCache: { data: Awaited<ReturnType<typeof getAiModels>>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const now = Date.now()
  if (modelsCache && now - modelsCache.fetchedAt < CACHE_TTL_MS) {
    return ok(modelsCache.data)
  }

  const token = await resolveAccessToken(session.user.id)
  const models = await getAiModels(token)
  // Defensive client-side filter: the platform's `?modelType=llm` query is
  // currently ignored by the backend (see QA_SWEEP_2026-04-25.md P1-2), so
  // the response includes TTS, embedding, image and video models that have
  // no business in an LLM picker. Filter to LLMs only.
  const llmsOnly = models.filter((m) => m.modelType === "llm")
  modelsCache = { data: llmsOnly, fetchedAt: now }

  return ok(llmsOnly)
}
