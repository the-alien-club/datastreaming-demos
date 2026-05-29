import "server-only"

import { getAiModels, type PublicAIModel } from "@/lib/platform/client"
import { resolveAccessToken } from "@/lib/auth-helpers"

// `select=public` returns the platform's curated public catalogue, so
// the cache is shared safely across users. If the upstream URL ever
// changes (e.g. to `select=mine`), drop this cache or key it by user.
let modelsCache: { data: PublicAIModel[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Returns the platform's curated list of public LLM models, filtered to
 * `modelType === "llm"`. Results are cached in-process for one hour — the
 * catalogue changes rarely and the cache is shared across all users.
 *
 * Defensive client-side filter: the platform's `?modelType=llm` query is
 * currently ignored by the backend (see QA_SWEEP_2026-04-25.md P1-2), so
 * the response includes TTS, embedding, image, and video models that have
 * no business in an LLM picker.
 */
export async function getAvailableLlms(userId: string): Promise<PublicAIModel[]> {
  const now = Date.now()
  if (modelsCache && now - modelsCache.fetchedAt < CACHE_TTL_MS) {
    return modelsCache.data
  }

  const token = await resolveAccessToken(userId)
  const models = await getAiModels(token)
  const llmsOnly = models.filter((m) => m.modelType === "llm")
  modelsCache = { data: llmsOnly, fetchedAt: now }
  return llmsOnly
}
