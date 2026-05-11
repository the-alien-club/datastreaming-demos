import "server-only"

import {
  insertSpecialist,
  updateSpecialistRecord,
  deleteSpecialistRecord,
} from "./queries"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import type { Specialist } from "./schema"
import type { SpecialistBody } from "./types"

/**
 * Creates a new specialist for `userId` from the validated request body.
 * Returns the persisted record.
 */
export async function createSpecialist(
  userId: string,
  data: SpecialistBody,
): Promise<Specialist> {
  const now = new Date()
  const id = crypto.randomUUID()

  return insertSpecialist({
    id,
    userId,
    name: data.name.trim(),
    description: data.description?.trim() ?? null,
    systemPrompt: data.systemPrompt.trim(),
    model: data.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: data.mcpIds && data.mcpIds.length > 0 ? JSON.stringify(data.mcpIds) : null,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * Updates an existing specialist identified by `id` with the validated
 * request body. Ownership must be verified by the caller before invoking.
 * Returns the updated record.
 */
export async function updateSpecialist(
  id: string,
  data: SpecialistBody,
): Promise<Specialist> {
  return updateSpecialistRecord(id, {
    name: data.name.trim(),
    description: data.description?.trim() ?? null,
    systemPrompt: data.systemPrompt.trim(),
    model: data.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: data.mcpIds && data.mcpIds.length > 0 ? JSON.stringify(data.mcpIds) : null,
    updatedAt: new Date(),
  })
}

/**
 * Toggles the public visibility of the specialist identified by `id`.
 * Ownership must be verified by the caller before invoking.
 * Returns the updated record.
 */
export async function publishSpecialist(
  id: string,
  isPublic: boolean,
): Promise<Specialist> {
  return updateSpecialistRecord(id, { isPublic, updatedAt: new Date() })
}

/**
 * Deletes the specialist identified by `id`.
 * Ownership must be verified by the caller before invoking.
 */
export async function deleteSpecialist(id: string): Promise<void> {
  await deleteSpecialistRecord(id)
}
