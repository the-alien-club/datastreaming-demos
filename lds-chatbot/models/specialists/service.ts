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
    isForkable: data.isForkable,
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
    isForkable: data.isForkable,
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

/**
 * Creates a copy of a forkable specialist under a new owner.
 *
 * The source specialist must be public and isForkable — both checks are
 * enforced by the route handler via SpecialistPolicy before calling here.
 * The forked specialist is private by default.
 */
export async function forkSpecialist(
  source: Specialist,
  targetUserId: string,
  nameSuffix: string,
): Promise<Specialist> {
  const now = new Date()
  return insertSpecialist({
    id: crypto.randomUUID(),
    userId: targetUserId,
    name: `${source.name}${nameSuffix}`,
    description: source.description ?? null,
    systemPrompt: source.systemPrompt,
    model: source.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: source.mcpIds ?? null,
    isPublic: false,
    isForkable: false,
    createdAt: now,
    updatedAt: now,
  })
}
