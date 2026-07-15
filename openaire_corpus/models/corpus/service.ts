// models/corpus/service.ts
// Business logic for corpus mutations. Orchestrates advisory locking,
// advanceVersion(), and snapshot construction.
//
// addIds() adds records INSTANTLY: an input ref is first canonicalized to its
// OpenAIRE id (a DOI is resolved via the MCP; an id passes through), then any id
// without a Document row is inserted as a "stub" (resolveStatus="pending")
// carrying only the id + DOI. Its full OpenAIRE metadata is resolved out-of-band
// by the background resolver (lib/documents/resolver.ts) — the corpus is never
// coupled to Graph-API latency. The caller (tool/route) kicks the resolver after
// the response is sent.
import "server-only"

import { CORPUS_REMOVE_PREVIEW_LIMIT } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { looksLikeOpenaireId, normalizeDoi, stripEntityPrefix } from "@/lib/mcp/vocab"
import { OpenaireClient } from "@/lib/openaire/client"
import { DocumentService } from "@/models/documents/service"
import type { Project } from "@/models/projects/schema"
import type { User } from "@/models/users/schema"
import { CorpusQueries, type CorpusFilterSet } from "./queries"
import { type CorpusSnapshot } from "./schema"
import { advanceVersion } from "./versioning"
import type { AddToCorpusInput, RemoveFromCorpusInput } from "./types"

/** Return shape for mutating operations — snapshot + delta counters. */
export type CorpusMutationResult = CorpusSnapshot & {
  lastDeltaAdded: number
  lastDeltaRemoved: number
}

/**
 * Result of addIds(). Extends the mutation result with:
 *   - `pending`     — how many of the added ids are newly-created stubs whose
 *                     metadata is still resolving in the background.
 *   - `requested`   — number of refs supplied in the call (before dedup).
 *   - `duplicates`  — supplied refs NOT newly added (already in the corpus or
 *                     repeated in the same call).
 *   - `unresolved`  — supplied refs that could not be canonicalized to an
 *                     OpenAIRE id (e.g. a DOI unknown to the Graph). Reported so
 *                     the agent can tell the user which inputs were dropped.
 */
export type CorpusAddResult = CorpusMutationResult & {
  pending: number
  requested: number
  duplicates: number
  unresolved: string[]
}

/**
 * Result of removeByFilter().
 *   - "empty_filter" — the filter set was empty (would match the whole corpus).
 *   - "dry_run"      — preview only: `matched` documents would be removed;
 *                      `ids` is a capped illustrative sample.
 *   - "removed"      — the removal committed: a new version was sealed.
 */
export type CorpusRemoveByFilterResult =
  | { status: "empty_filter" }
  | { status: "dry_run"; matched: number; ids: string[] }
  | {
      status: "removed"
      matched: number
      removed: number
      versionSeq: number
      total: number
    }

export class CorpusService {
  /**
   * Adds records (OpenAIRE ids or DOIs) to the project's corpus INSTANTLY.
   *
   * Phase 0 — canonicalize (network only for DOI inputs): each input ref is
   *   resolved to a bare OpenAIRE id. An id ref passes through (prefix stripped);
   *   a DOI ref is resolved via the MCP (openaire_kg_search_research_products by
   *   pid). Refs that don't resolve are collected in `unresolved` and dropped —
   *   an unknown DOI has no corpus key.
   *
   * Phase 1 — stub (no lock, no network): ids without a Document row are inserted
   *   as pending stubs (id + DOI). Metadata resolves out-of-band.
   *
   * Phase 2 — advance (tx + per-project advisory lock): add the ids not already
   *   in head; advanceVersion() seals the new version. seq/status/total are
   *   captured INSIDE the tx so the result is correct under concurrency.
   *
   * `sessionId` (optional) — the agent session performing the add. A
   * CorpusContribution row is recorded for EVERY supplied (deduped, canonical)
   * id, not only the newly-added ones (multi-session attribution).
   */
  static async addIds(
    project: Project,
    user: User,
    input: AddToCorpusInput,
    sessionId?: string,
  ): Promise<CorpusAddResult> {
    const projectId = project.id
    const requested = input.ids.length

    // === Phase 0: canonicalize refs → bare OpenAIRE ids =======================
    const { ids: uniqueIds, dois, unresolved } = await CorpusService.canonicalize(
      input.ids,
    )

    // === Phase 1: create stub rows for unknown ids (no lock) ==================
    const newStubIds = await DocumentService.createStubs(projectId, uniqueIds, dois)
    const newStubSet = new Set(newStubIds)

    // === Phase 2: advance the version (tx + advisory lock) ====================
    const advance = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project:${projectId}`}))`

      const head = await CorpusQueries.headVersion(projectId)
      const memberSet = new Set(head.membership.map((m) => m.openaireId))
      const addIds = uniqueIds.filter((a) => !memberSet.has(a))

      const newVersion = await advanceVersion(tx, projectId, head, {
        addIds,
        removeIds: [],
        createdBy: `user:${user.id}`,
        note: input.reason,
      })

      const total = await tx.corpusMembership.count({
        where: { versionId: newVersion.id },
      })

      return {
        addedIds: addIds,
        versionSeq: newVersion.seq,
        versionStatus: newVersion.status as CorpusSnapshot["versionStatus"],
        total,
      }
    })

    // --- Record session attribution (optional) --------------------------------
    if (sessionId !== undefined && uniqueIds.length > 0) {
      await prisma.corpusContribution.createMany({
        data: uniqueIds.map((openaireId) => ({ projectId, openaireId, sessionId })),
        skipDuplicates: true,
      })
    }

    // --- Build the comprehension snapshot from the committed head -------------
    const snapshot = await CorpusQueries.snapshot(projectId, "head")

    const pending = advance.addedIds.filter((a) => newStubSet.has(a)).length

    return {
      ...snapshot,
      versionSeq: advance.versionSeq,
      versionStatus: advance.versionStatus,
      total: advance.total,
      lastDeltaAdded: advance.addedIds.length,
      lastDeltaRemoved: 0,
      pending,
      requested,
      duplicates: requested - advance.addedIds.length - unresolved.length,
      unresolved,
    }
  }

  /**
   * Canonicalize a list of input refs (OpenAIRE ids and/or DOIs) into a deduped
   * list of bare OpenAIRE ids. An id ref passes through (prefix stripped); a DOI
   * ref is resolved via the MCP. Returns the unique ids, a openaireId→DOI map
   * (for stub rows), and the refs that could not be resolved.
   */
  private static async canonicalize(
    refs: string[],
  ): Promise<{ ids: string[]; dois: Map<string, string>; unresolved: string[] }> {
    const ids = new Set<string>()
    const dois = new Map<string, string>()
    const unresolved: string[] = []

    // Split into pass-through ids and DOI refs to resolve.
    const doiRefs: string[] = []
    for (const ref of refs) {
      const trimmed = ref.trim()
      if (looksLikeOpenaireId(trimmed)) {
        const id = stripEntityPrefix(trimmed)
        ids.add(id)
      } else {
        doiRefs.push(trimmed)
      }
    }

    if (doiRefs.length > 0) {
      const client = new OpenaireClient()
      // Resolve DOIs sequentially-bounded via the client's own concurrency in
      // resolveDoi is single-shot; a small manual fan-out keeps it simple.
      await Promise.all(
        [...new Set(doiRefs)].map(async (ref) => {
          try {
            const id = await client.resolveDoi(ref)
            if (id) {
              ids.add(id)
              const bare = normalizeDoi(ref)
              if (bare) dois.set(id, bare)
            } else {
              unresolved.push(ref)
            }
          } catch {
            unresolved.push(ref)
          }
        }),
      )
    }

    return { ids: [...ids], dois, unresolved }
  }

  /**
   * Removes ids from the project's corpus. Membership change only — the Document
   * row lives forever (corpus-versioning invariant).
   */
  static async removeIds(
    project: Project,
    user: User,
    input: RemoveFromCorpusInput,
  ): Promise<CorpusMutationResult> {
    const projectId = project.id

    const advance = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project:${projectId}`}))`

      const head = await CorpusQueries.headVersion(projectId)
      const existingSet = new Set(head.membership.map((m) => m.openaireId))
      const toRemove = input.ids.filter((a) => existingSet.has(a))

      const newVersion = await advanceVersion(tx, projectId, head, {
        addIds: [],
        removeIds: toRemove,
        createdBy: `user:${user.id}`,
        note: input.reason,
      })

      const total = await tx.corpusMembership.count({
        where: { versionId: newVersion.id },
      })

      return {
        removed: toRemove.length,
        versionSeq: newVersion.seq,
        versionStatus: newVersion.status as CorpusSnapshot["versionStatus"],
        total,
      }
    })

    const snapshot = await CorpusQueries.snapshot(projectId, "head")

    return {
      ...snapshot,
      versionSeq: advance.versionSeq,
      versionStatus: advance.versionStatus,
      total: advance.total,
      lastDeltaAdded: 0,
      lastDeltaRemoved: advance.removed,
    }
  }

  /**
   * Remove every document in the current head matching a metadata filter — the
   * bulk counterpart to removeIds(). Resolves the matching ids from head, then:
   *   - dryRun → returns the count + a capped sample, NO mutation (preview).
   *   - commit → delegates to removeIds() (TOCTOU-safe: re-filters to current
   *              head members inside the advisory lock).
   *
   * SAFETY: an empty filter set would match the entire corpus, so it is refused
   * ("empty_filter") rather than silently wiping the corpus.
   */
  static async removeByFilter(
    project: Project,
    user: User,
    input: { filters: CorpusFilterSet; reason: string; dryRun: boolean },
  ): Promise<CorpusRemoveByFilterResult> {
    if (CorpusService.isEmptyFilterSet(input.filters)) {
      return { status: "empty_filter" }
    }

    const ids = await CorpusQueries.idsMatchingFilters(
      project.id,
      "head",
      input.filters,
    )

    if (input.dryRun) {
      return {
        status: "dry_run",
        matched: ids.length,
        ids: ids.slice(0, CORPUS_REMOVE_PREVIEW_LIMIT),
      }
    }

    if (ids.length === 0) {
      const head = await CorpusQueries.headVersion(project.id)
      const total = await prisma.corpusMembership.count({
        where: { versionId: head.id },
      })
      return { status: "removed", matched: 0, removed: 0, versionSeq: head.seq, total }
    }

    const result = await CorpusService.removeIds(project, user, {
      ids,
      reason: input.reason,
    })

    return {
      status: "removed",
      matched: ids.length,
      removed: result.lastDeltaRemoved,
      versionSeq: result.versionSeq,
      total: result.total,
    }
  }

  /** True when no filter field carries a constraint (would match everything). */
  private static isEmptyFilterSet(filters: CorpusFilterSet): boolean {
    const hasArray = (a?: string[]) => Array.isArray(a) && a.length > 0
    return !(
      hasArray(filters.type) ||
      hasArray(filters.lang) ||
      hasArray(filters.oa) ||
      hasArray(filters.peer) ||
      hasArray(filters.funder) ||
      hasArray(filters.session) ||
      filters.yearFrom !== undefined ||
      filters.yearTo !== undefined ||
      filters.undated === true ||
      (typeof filters.q === "string" && filters.q.trim().length > 0)
    )
  }
}
