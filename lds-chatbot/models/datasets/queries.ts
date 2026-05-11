import "server-only"

import { prisma } from "@/lib/db"
import { datasetRow, type DatasetSelect, type DatasetInsert } from "./schema"

// ─── Read projections ─────────────────────────────────────────────────────────

// getDatasets returns plain dataset rows with an `isOwn` discriminator.
// Enrichment with cross-model data (attached-agent counts, attached agent
// names) is the responsibility of datasets/service.ts, which is allowed to
// import from other models' query files.

export type DatasetRow = DatasetSelect & { isOwn: boolean }

/**
 * Returns all datasets owned by `userId` (plus public datasets from other
 * users), newest first.
 *
 * The returned rows carry an `isOwn` discriminator but no cross-model data.
 * Call `getDatasetsSummary` in `service.ts` for the enriched view that
 * includes attached-agent counts.
 */
export async function getDatasets(userId: string): Promise<DatasetRow[]> {
  const [ownRows, publicRows] = await Promise.all([
    prisma.dataset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      ...datasetRow,
    }),
    prisma.dataset.findMany({
      where: { isPublic: true, userId: { not: userId } },
      orderBy: { createdAt: "desc" },
      ...datasetRow,
    }),
  ])

  return [
    ...ownRows.map((r) => ({ ...r, isOwn: true as const })),
    ...publicRows.map((r) => ({ ...r, isOwn: false as const })),
  ]
}

/**
 * Returns a single dataset by ID regardless of ownership. Use only for
 * internal service operations where ownership has already been verified.
 * Returns `undefined` when no matching row exists.
 */
export async function getDatasetById(id: string): Promise<DatasetSelect | undefined> {
  const row = await prisma.dataset.findUnique({ where: { id }, ...datasetRow })
  return row ?? undefined
}

/**
 * Returns a single dataset scoped to `userId`. Returns `undefined` when no
 * matching row exists.
 *
 * This function returns the raw dataset record without cross-model data.
 * The service layer is responsible for enriching with attached-agent info
 * when needed for display.
 */
export async function getDataset(
  id: string,
  userId: string,
): Promise<DatasetSelect | undefined> {
  const row = await prisma.dataset.findFirst({ where: { id, userId }, ...datasetRow })
  return row ?? undefined
}

// ─── Write operations ─────────────────────────────────────────────────────────

export async function insertDataset(data: DatasetInsert): Promise<DatasetSelect> {
  return prisma.dataset.create({ data, ...datasetRow })
}

export async function updateDatasetRecord(
  id: string,
  data: Partial<DatasetInsert>,
): Promise<DatasetSelect | undefined> {
  try {
    return await prisma.dataset.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      ...datasetRow,
    })
  } catch {
    // Prisma throws P2025 when the record is not found; treat as undefined.
    return undefined
  }
}

export async function deleteDatasetRecord(id: string): Promise<void> {
  await prisma.dataset.delete({ where: { id } })
}

export async function updateDatasetStatus(
  id: string,
  status: string,
): Promise<DatasetSelect | undefined> {
  try {
    return await prisma.dataset.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      ...datasetRow,
    })
  } catch {
    // Prisma throws P2025 when the record is not found; treat as undefined.
    return undefined
  }
}
