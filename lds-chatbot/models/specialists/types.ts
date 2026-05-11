import { z } from "zod"
import type { Specialist } from "./schema"

const ID = z.string().trim().min(1, "must be non-empty")
const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")

// ── Schemas ────────────────────────────────────────────────────────────────

export const specialistBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.nullable().optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(64_000),
  model: z.string().trim().min(1).max(120).optional(),
  mcpIds: z.array(ID).optional(),
})
export type SpecialistBody = z.infer<typeof specialistBodySchema>

// Narrow schema for PATCH /api/specialists/[id]/visibility.
export const patchVisibilityBodySchema = z.object({
  isPublic: z.boolean(),
})
export type PatchVisibilityBody = z.infer<typeof patchVisibilityBodySchema>

// ── Response types ─────────────────────────────────────────────────────────

export type SpecialistRow = Specialist

export type SpecialistResponse = SpecialistRow & { isOwn?: boolean }
export type SpecialistListResponse = SpecialistResponse[]
