// models/corpus/versioning.ts
// The single function that creates new CorpusVersion rows.
//
// RULES (from playbook/corpus-versioning.md):
//   - advanceVersion() is the ONLY place that creates new CorpusVersion rows.
//   - headVersionId on Project is ONLY moved here.
//   - A no-op delta (nothing added, nothing removed) returns parent unchanged
//     and does NOT create a new version.
//   - Must run inside a prisma.$transaction (started by the calling service).
//   - Invariants 1-6 from playbook/corpus-versioning.md must hold at all times.
import "server-only"

import { Prisma } from "@/lib/generated/prisma/client"
import { CORPUS_VERSION_STATUS, type CorpusVersionWithIds } from "./schema"

/**
 * Input to advanceVersion. The calling service computes addIds / removeIds
 * before entering the transaction.
 */
export type AdvanceVersionDelta = {
  /** OpenAIRE ids to include in the new version that are not in the parent. */
  addIds: string[]
  /** ids present in the parent to exclude from the new version. */
  removeIds: string[]
  /** Stable identity of the actor: "agent:session:<sid>" | "user:<uid>" */
  createdBy: string
  /** Optional human-readable reason for the version (stored as note). */
  note?: string
}

/**
 * Creates a new sealed CorpusVersion that carries forward all membership from
 * `parent` minus `delta.removeIds`, then adds `delta.addIds`. Atomically
 * swings `Project.headVersionId` to the new version's id.
 *
 * Returns `parent` unchanged when the delta is a no-op (both addIds and
 * removeIds are empty). This keeps the version stream meaningful — one entry
 * per actual change.
 *
 * Must be called inside a `prisma.$transaction` callback.
 *
 * @param tx        Prisma transactional client (Prisma.TransactionClient).
 * @param projectId The project whose corpus is being mutated.
 * @param parent    The current head version, with membership ids included.
 * @param delta     What to add, what to remove, and who is making the change.
 */
export async function advanceVersion(
  tx: Prisma.TransactionClient,
  projectId: string,
  parent: CorpusVersionWithIds,
  delta: AdvanceVersionDelta,
): Promise<CorpusVersionWithIds> {
  // --- No-op short-circuit ---------------------------------------------------
  if (delta.addIds.length === 0 && delta.removeIds.length === 0) {
    return parent
  }

  // --- Compute the carried membership ----------------------------------------
  const removedSet = new Set(delta.removeIds)
  const parentMembership = await tx.corpusMembership.findMany({
    where: { versionId: parent.id },
    select: { openaireId: true },
  })
  const carried = parentMembership
    .map((r) => r.openaireId)
    .filter((a) => !removedSet.has(a))

  // --- Create the new version ------------------------------------------------
  // seq is parent.seq + 1 (monotonic per project — invariant 2).
  // status is SEALED immediately (corpus_membership rows land in the same tx).
  const next = await tx.corpusVersion.create({
    data: {
      projectId,
      seq: parent.seq + 1,
      status: CORPUS_VERSION_STATUS.SEALED,
      parentId: parent.id,
      createdBy: delta.createdBy,
      note: delta.note ?? null,
    },
  })

  // --- Materialise membership ------------------------------------------------
  // Full membership = carried from parent + newly added ids.
  // projectId is denormalized on each row for filter-performance (see schema).
  const members = [...carried, ...delta.addIds].map((openaireId) => ({
    versionId: next.id,
    openaireId,
    projectId,
  }))

  if (members.length > 0) {
    await tx.corpusMembership.createMany({ data: members })
  }

  // --- Swing the head pointer ------------------------------------------------
  await tx.project.update({
    where: { id: projectId },
    data: { headVersionId: next.id },
  })

  return tx.corpusVersion.findUniqueOrThrow({
    where: { id: next.id },
    include: { membership: { select: { openaireId: true } } },
  })
}
