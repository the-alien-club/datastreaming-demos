import type { PublicAIModel } from "@/lib/platform/client"

// Response type for GET /api/models — the curated LLM catalogue returned by
// the platform API. Re-exported from here so route handlers and hooks share a
// single definition rather than each importing PublicAIModel directly.
export type AiModelResponse = PublicAIModel[]
