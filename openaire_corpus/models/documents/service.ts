// models/documents/service.ts
// Business logic for document mutations.
// Used by the seed script and by the corpus add path when the agent adds
// OpenAIRE ids that don't yet have Document rows.
import "server-only"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { DOCUMENT_RESOLVE_STATUS } from "./schema"

/** Shape of a document to upsert. Mirrors the Document table columns. */
export type DocumentUpsertData = Omit<
  Prisma.DocumentCreateInput,
  "project" | "membership"
> & {
  projectId: string
  openaireId: string
}

export class DocumentService {
  /**
   * Bulk-upserts document metadata rows.
   *
   * `skipDuplicates: true` makes the operation idempotent — re-seeding or
   * re-resolving the same id is safe. Existing rows are NOT updated; a
   * deliberate re-resolve should use an explicit update instead.
   */
  static async upsertMany(
    projectId: string,
    docs: Array<Omit<DocumentUpsertData, "projectId">>,
  ): Promise<void> {
    if (docs.length === 0) return

    await prisma.document.createMany({
      // These rows carry full metadata, so they are born "resolved" — the
      // drainer must not pick them up. (createMany default would be "pending".)
      data: docs.map((d) => ({
        resolveStatus: DOCUMENT_RESOLVE_STATUS.RESOLVED,
        resolvedAt: new Date(),
        ...d,
        projectId,
      })),
      skipDuplicates: true,
    })
  }

  /**
   * Insert "stub" Document rows for OpenAIRE ids being added to the corpus. A
   * stub carries only the id (and, when the ref was a DOI, the resolved DOI);
   * all metadata (title, abstract, OA status, …) is filled in later by the
   * background resolver. Idempotent: `skipDuplicates` means an id that already
   * has a row (stub or resolved) is left untouched.
   *
   * Returns the ids that were newly inserted (had no prior row), so the caller
   * can report how many are now pending.
   *
   * `dois` (optional) maps openaireId → bare DOI when the caller resolved a DOI
   * input; recorded on the stub so the detail panel can link out before the
   * full metadata lands.
   */
  static async createStubs(
    projectId: string,
    ids: string[],
    dois?: Map<string, string>,
  ): Promise<string[]> {
    if (ids.length === 0) return []

    const existing = await prisma.document.findMany({
      where: { projectId, openaireId: { in: ids } },
      select: { openaireId: true },
    })
    const existingSet = new Set(existing.map((d) => d.openaireId))
    const newIds = ids.filter((a) => !existingSet.has(a))
    if (newIds.length === 0) return []

    await prisma.document.createMany({
      data: newIds.map((openaireId) => ({
        projectId,
        openaireId,
        doi: dois?.get(openaireId) ?? null,
        resolveStatus: DOCUMENT_RESOLVE_STATUS.PENDING,
      })),
      skipDuplicates: true,
    })
    return newIds
  }

  /**
   * Re-queue metadata resolution for the given ids: flip them back to `pending`
   * and reset the attempt counter so the background resolver picks them up on the
   * next kick. Used by the manual "retry" affordance on a failed document and by
   * the panel's auto-retry on first paint.
   *
   * Scoped to the project and to documents currently in a terminal/limbo state
   * (`failed`, or `pending` with attempts exhausted). Returns the number of rows
   * actually re-queued so the caller knows whether to kick the resolver.
   */
  static async retryResolution(
    projectId: string,
    ids: string[],
  ): Promise<{ retried: number }> {
    if (ids.length === 0) return { retried: 0 }

    const res = await prisma.document.updateMany({
      where: {
        projectId,
        openaireId: { in: ids },
        resolveStatus: { not: DOCUMENT_RESOLVE_STATUS.RESOLVED },
      },
      data: {
        resolveStatus: DOCUMENT_RESOLVE_STATUS.PENDING,
        resolveAttempts: 0,
        resolveError: null,
      },
    })
    return { retried: res.count }
  }
}
