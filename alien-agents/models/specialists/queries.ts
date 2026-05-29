import "server-only"

import { prisma } from "@/lib/db"
import { specialistRow, type Specialist } from "./schema"
import type { SpecialistUncheckedCreateInput } from "@/lib/generated/prisma/models"

export type SpecialistWithOwnership = Specialist & { isOwn: boolean }

/**
 * Returns all specialists owned by `userId`, newest first.
 */
export async function getSpecialists(userId: string): Promise<SpecialistWithOwnership[]> {
  const rows = await prisma.specialist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...specialistRow,
  })
  return rows.map((r) => ({ ...r, isOwn: true }))
}

/**
 * Returns a single specialist that belongs to `userId`.
 * Returns `undefined` when no matching row exists.
 */
export async function getSpecialist(
  id: string,
  userId: string,
): Promise<SpecialistWithOwnership | undefined> {
  const row = await prisma.specialist.findFirst({
    where: { id, userId },
    ...specialistRow,
  })
  return row ? { ...row, isOwn: true } : undefined
}

/**
 * Returns a single specialist by `id` only, without filtering by owner.
 * The caller is responsible for enforcing ownership via `SpecialistPolicy`
 * before returning data to the requesting user.
 *
 * Returns `undefined` when no matching row exists.
 */
export async function getSpecialistById(id: string): Promise<Specialist | undefined> {
  const row = await prisma.specialist.findUnique({
    where: { id },
    ...specialistRow,
  })
  return row ?? undefined
}

/**
 * Returns all public specialists, newest first.
 * Intended for the public library — includes the viewer's own public specialists.
 */
export async function getAllPublicSpecialists(): Promise<Specialist[]> {
  return prisma.specialist.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    ...specialistRow,
  })
}

/**
 * Returns all public specialists NOT owned by `userId`, newest first.
 */
export async function getPublicSpecialists(userId: string): Promise<SpecialistWithOwnership[]> {
  const rows = await prisma.specialist.findMany({
    where: { isPublic: true, userId: { not: userId } },
    orderBy: { createdAt: "desc" },
    ...specialistRow,
  })
  return rows.map((r) => ({ ...r, isOwn: false }))
}

/**
 * Inserts a new specialist row and returns the created record.
 */
export async function insertSpecialist(values: SpecialistUncheckedCreateInput): Promise<Specialist> {
  return prisma.specialist.create({ data: values, ...specialistRow })
}

/**
 * Updates fields on an existing specialist row identified by `id`.
 * Returns the updated record.
 */
export async function updateSpecialistRecord(
  id: string,
  values: Partial<Omit<Specialist, "id">>,
): Promise<Specialist> {
  return prisma.specialist.update({ where: { id }, data: values, ...specialistRow })
}

/**
 * Deletes the specialist row identified by `id`.
 */
export async function deleteSpecialistRecord(id: string): Promise<void> {
  await prisma.specialist.delete({ where: { id } })
}
