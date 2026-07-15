import "server-only"
// models/ingest/service.ts
// Business logic for the ingestion lifecycle.
//
// INVARIANTS (enforced here, never elsewhere):
//   • project.ingestedVersionId is moved ONLY within this service — by
//     IngestService.commit() (full success) AND commitPartialFailure() (partial
//     run). The per-doc Document.indexedAt is the real delta truth; this pointer
//     is the "Last ingestion vN" label. Only a WHOLE-job failure leaves it behind.
//   • The no-op short-circuit (added=[] && removed=[]) creates a done job and
//     advances bookkeeping in a single atomic transaction without calling the cluster.
//   • Deduplication: if a (projectId, targetVersionId) job is already queued/running,
//     IngestService.submit() returns the existing job — no new row.
//
// OpenAIRE ingestion has no confirmation gate: every corpus document is
// ingestable (its abstract + metadata are always indexable; open-access full
// text is fetched where licensing permits). The worker re-resolves each record
// from the Graph API, so the added delta carries only ids — nothing is excluded
// up front.
import crypto from "node:crypto"
import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import type { IngestJob, Project, User } from "@/lib/generated/prisma/client"
import { CorpusQueries } from "@/models/corpus/queries"
import { INGEST_STATUS } from "./schema"
import type {
  IngestResults,
  IngestSubmitInput,
  IngestSubmitOutcome,
} from "./types"
import type {
  ClusterDoc,
  ClusterProgressEvent,
  ClusterQueueProgress,
} from "@/lib/cluster/contracts"
import { ClusterRunner } from "@/lib/cluster/runner"
import { env } from "@/lib/env"

export class IngestService {
  /**
   * Submit an ingestion job for a project.
   *
   * Resolution order:
   *   1. Resolve target version (head, or the explicitly requested seq).
   *   2. Resolve base version (last ingested, or null for first ingest).
   *   3. Compute the delta per-DOCUMENT against the index (Document.indexedAt):
   *      added = target ∖ indexed, removed = indexed ∖ target.
   *   4. Deduplication: if a queued/running job already exists for
   *      (projectId, targetVersionId), return it unchanged.
   *   5. No-op short-circuit: if delta is empty, create a done job + advance
   *      ingestedVersionId atomically. No cluster call.
   *   6. Insert job row, enqueue to cluster runner.
   */
  static async submit(
    project: Project,
    user: User,
    input: IngestSubmitInput,
  ): Promise<IngestSubmitOutcome> {
    // 1. Resolve target version
    let targetVersion: Awaited<ReturnType<typeof CorpusQueries.headVersion>>

    if (input.targetVersionSeq !== undefined) {
      targetVersion = await prisma.corpusVersion.findUniqueOrThrow({
        where: {
          projectId_seq: { projectId: project.id, seq: input.targetVersionSeq },
        },
        include: { membership: { select: { openaireId: true } } },
      })
    } else {
      targetVersion = await CorpusQueries.headVersion(project.id)
    }

    // 2. Resolve base version — provenance + the "Last ingestion vN" label.
    const baseVersion = await CorpusQueries.ingestedVersion(project.id)

    // 3. Compute delta — per DOCUMENT, against what's actually in the index.
    const targetIds = await CorpusQueries.membershipIds(targetVersion.id)
    const indexedIds = await CorpusQueries.indexedIds(project.id)

    const indexedSet = new Set(indexedIds)
    const targetSet = new Set(targetIds)

    const addedIds = targetIds.filter((a) => !indexedSet.has(a))
    const removedIds = indexedIds.filter((a) => !targetSet.has(a))

    // 4. Deduplication guard.
    const existing = await prisma.ingestJob.findFirst({
      where: {
        projectId: project.id,
        targetVersionId: targetVersion.id,
        status: { in: [INGEST_STATUS.QUEUED, INGEST_STATUS.RUNNING] },
      },
    })
    if (existing) return { kind: "job", job: existing }

    // 5. No-op short-circuit.
    if (addedIds.length === 0 && removedIds.length === 0) {
      return {
        kind: "job",
        job: await IngestService._commitNoOp(
          project,
          user,
          targetVersion.id,
          baseVersion?.id ?? null,
        ),
      }
    }

    // 6. Fetch document metadata for the cluster.
    const addedDocs = await IngestService._loadClusterDocs(project.id, addedIds)

    // 7. Per-job HMAC secret.
    const callbackSecret = crypto.randomBytes(32).toString("hex")

    // 8. Insert job row.
    const job = await prisma.ingestJob.create({
      data: {
        projectId: project.id,
        targetVersionId: targetVersion.id,
        baseVersionId: baseVersion?.id ?? null,
        status: INGEST_STATUS.QUEUED,
        addedCount: addedIds.length,
        removedCount: removedIds.length,
        addedIds,
        removedIds,
        excludedIds: [],
        excludedCount: 0,
        callbackSecret,
      },
    })

    // 9. Enqueue to cluster runner.
    const callbackBase = process.env.WORKER_CALLBACK_BASE_URL ?? env.APP_URL
    const callbackUrl = `${callbackBase}/api/internal/ingest/${job.id}/progress`

    const { clusterJobId } = await ClusterRunner.submit({
      projectId: project.id,
      targetVersionId: targetVersion.id,
      appJobId: job.id,
      added: addedDocs,
      removed: removedIds,
      callbackUrl,
      callbackSecret,
    })

    // 10. Persist clusterJobId and transition to running.
    const running = await prisma.ingestJob.update({
      where: { id: job.id },
      data: {
        clusterJobId,
        status: INGEST_STATUS.RUNNING,
        startedAt: new Date(),
      },
    })
    return { kind: "job", job: running }
  }

  /**
   * Compute the delta the next ingestion would carry — WITHOUT creating a job.
   * Renders the Ingest overview (+added / -removed counts). Mirrors submit()
   * steps 1–3 exactly so the preview can never drift from an actual submit.
   */
  static async previewDelta(
    project: Project,
  ): Promise<{ added: number; removed: number }> {
    const targetVersion = await CorpusQueries.headVersion(project.id)
    const targetIds = await CorpusQueries.membershipIds(targetVersion.id)
    const indexedIds = await CorpusQueries.indexedIds(project.id)

    const indexedSet = new Set(indexedIds)
    const targetSet = new Set(targetIds)

    return {
      added: targetIds.filter((a) => !indexedSet.has(a)).length,
      removed: indexedIds.filter((a) => !targetSet.has(a)).length,
    }
  }

  /**
   * Cancel an in-flight job. Best-effort: partial vectors written by the cluster
   * may remain in the index. `_user` is kept for future audit logging.
   */
  static async cancel(job: IngestJob, _user: User): Promise<IngestJob> {
    const updated = await prisma.ingestJob.update({
      where: { id: job.id },
      data: { status: INGEST_STATUS.CANCELED, finishedAt: new Date() },
    })
    if (job.clusterJobId) {
      await ClusterRunner.cancel(job.clusterJobId)
    }
    return updated
  }

  /**
   * Fetch the worker's live queue-status read-model for a job, for the Ingest
   * live view. Returns null when there is nothing to poll. The version commit
   * never depends on this — it rides the terminal callback.
   */
  static async queueProgress(job: IngestJob): Promise<ClusterQueueProgress | null> {
    if (!job.clusterJobId) return null
    if (job.status !== INGEST_STATUS.RUNNING && job.status !== INGEST_STATUS.QUEUED) {
      return null
    }
    return ClusterRunner.progress(job.clusterJobId)
  }

  /**
   * Apply a progress event posted by the cluster to the job row.
   * - Running stages: update status, stage, progress, stats.
   * - done: delegate to commit() / commitPartialFailure().
   * - failed: record error, mark failed. ingestedVersionId NOT advanced.
   */
  static async applyProgress(
    job: IngestJob,
    event: ClusterProgressEvent,
  ): Promise<void> {
    if (event.stage === "done") {
      const failedCount = Number(
        (event.stats as Record<string, unknown>)?.failed ?? 0,
      )
      if (failedCount > 0) {
        await IngestService.commitPartialFailure(job, {
          chunksWritten: event.chunksWritten,
          stats: event.stats,
        })
      } else {
        await IngestService.commit(job, {
          chunksWritten: event.chunksWritten,
          stats: event.stats,
        })
      }
    } else if (event.stage === "failed") {
      await prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: INGEST_STATUS.FAILED,
          error: event.error,
          finishedAt: new Date(),
          ...(event.partialStats ? { stats: event.partialStats as never } : {}),
        },
      })
    } else {
      // Running stage: dedup | embed | index
      await prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: INGEST_STATUS.RUNNING,
          stage: event.stage,
          progress: event.fraction,
          stats: event.counters as never,
        },
      })
    }
  }

  /**
   * Commit a successful ingest. Atomically marks the job done, marks the target
   * version "ingested", advances project.ingestedVersionId, and stamps
   * Document.indexedAt for every added id (clearing it for removed ids).
   */
  static async commit(job: IngestJob, results: IngestResults): Promise<void> {
    const now = new Date()
    await prisma.$transaction([
      prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: INGEST_STATUS.DONE,
          finishedAt: now,
          chunksWritten: results.chunksWritten,
          stats: results.stats as never,
        },
      }),
      prisma.corpusVersion.update({
        where: { id: job.targetVersionId },
        data: { status: "ingested" },
      }),
      prisma.project.update({
        where: { id: job.projectId },
        data: { ingestedVersionId: job.targetVersionId },
      }),
      prisma.document.updateMany({
        where: { projectId: job.projectId, openaireId: { in: job.addedIds } },
        data: { indexedAt: now, indexError: null },
      }),
      prisma.document.updateMany({
        where: { projectId: job.projectId, openaireId: { in: job.removedIds } },
        data: { indexedAt: null },
      }),
    ])
  }

  /**
   * Terminal state for a job that finished but had per-doc failures (PARTIAL).
   * Stamps Document.indexedAt for the ids that DID succeed, records each failed
   * id's reason in Document.indexError (indexedAt left null → it stays in the
   * delta to retry), and still advances the baseline pointer (same as commit()).
   */
  static async commitPartialFailure(
    job: IngestJob,
    results: IngestResults,
  ): Promise<void> {
    const stats = results.stats as Record<string, unknown>
    const failed = Number(stats?.failed ?? 0)
    const total = Number(stats?.total ?? 0)
    const errorById = IngestService._errorsById(stats)
    const failedSet = new Set(errorById.keys())
    const succeededAdded = job.addedIds.filter((a) => !failedSet.has(a))
    const now = new Date()

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.ingestJob.update({
        where: { id: job.id },
        data: {
          status: INGEST_STATUS.PARTIAL,
          finishedAt: now,
          chunksWritten: results.chunksWritten,
          stats: results.stats as never,
          error: `${failed}/${total} document(s) failed — retry the failed documents`,
        },
      }),
      prisma.corpusVersion.update({
        where: { id: job.targetVersionId },
        data: { status: "ingested" },
      }),
      prisma.project.update({
        where: { id: job.projectId },
        data: { ingestedVersionId: job.targetVersionId },
      }),
    ]
    if (succeededAdded.length > 0) {
      ops.push(
        prisma.document.updateMany({
          where: { projectId: job.projectId, openaireId: { in: succeededAdded } },
          data: { indexedAt: now, indexError: null },
        }),
      )
    }
    for (const [id, reason] of errorById) {
      ops.push(
        prisma.document.updateMany({
          where: { projectId: job.projectId, openaireId: id },
          data: { indexError: reason },
        }),
      )
    }
    if (job.removedIds.length > 0) {
      ops.push(
        prisma.document.updateMany({
          where: { projectId: job.projectId, openaireId: { in: job.removedIds } },
          data: { indexedAt: null },
        }),
      )
    }
    await prisma.$transaction(ops)
  }

  /** Map of failed id → reason, read from the worker's `stats.errors[]`. */
  private static _errorsById(
    stats: Record<string, unknown> | null | undefined,
  ): Map<string, string> {
    const raw = stats?.errors
    const out = new Map<string, string>()
    if (!Array.isArray(raw)) return out
    for (const e of raw) {
      if (e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string") {
        const r = e as { id: string; stage?: unknown; reason?: unknown }
        out.set(
          r.id,
          typeof r.reason === "string"
            ? r.reason
            : typeof r.stage === "string"
              ? r.stage
              : "failed",
        )
      }
    }
    return out
  }

  /**
   * Retry failed documents from a previous ingest job. Reads `stats.errors` for
   * the failed ids; creates a new job targeting the same version with those ids.
   */
  static async retryFailed(
    jobId: string,
    _user: User,
  ): Promise<{ created: false } | IngestJob> {
    const job = await prisma.ingestJob.findUniqueOrThrow({ where: { id: jobId } })

    const stats = job.stats as Record<string, unknown> | null | undefined
    const rawErrors = stats?.errors
    const errors = Array.isArray(rawErrors)
      ? (rawErrors as { id: string; stage: string; reason: string }[])
      : []

    if (errors.length === 0) return { created: false }

    const failedIds = errors.map((e) => e.id)
    const addedDocs = await IngestService._loadClusterDocs(job.projectId, failedIds)
    const callbackSecret = crypto.randomBytes(32).toString("hex")

    const retryJob = await prisma.ingestJob.create({
      data: {
        projectId: job.projectId,
        targetVersionId: job.targetVersionId,
        baseVersionId: job.baseVersionId,
        status: INGEST_STATUS.QUEUED,
        addedCount: failedIds.length,
        removedCount: 0,
        addedIds: failedIds,
        removedIds: [],
        callbackSecret,
      },
    })

    const retryCallbackBase = process.env.WORKER_CALLBACK_BASE_URL ?? env.APP_URL
    const callbackUrl = `${retryCallbackBase}/api/internal/ingest/${retryJob.id}/progress`

    const { clusterJobId } = await ClusterRunner.submit({
      projectId: job.projectId,
      targetVersionId: job.targetVersionId,
      appJobId: retryJob.id,
      added: addedDocs,
      removed: [],
      callbackUrl,
      callbackSecret,
    })

    return prisma.ingestJob.update({
      where: { id: retryJob.id },
      data: {
        clusterJobId,
        status: INGEST_STATUS.RUNNING,
        startedAt: new Date(),
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * No-op short-circuit path: added and removed are both empty. Creates a
   * terminal done job and advances ingestedVersionId atomically. No cluster call.
   */
  private static async _commitNoOp(
    project: Project,
    _user: User,
    targetVersionId: string,
    baseVersionId: string | null,
  ): Promise<IngestJob> {
    const now = new Date()
    let job!: IngestJob
    await prisma.$transaction(async (tx) => {
      job = await tx.ingestJob.create({
        data: {
          projectId: project.id,
          targetVersionId,
          baseVersionId,
          status: INGEST_STATUS.DONE,
          addedCount: 0,
          removedCount: 0,
          addedIds: [],
          removedIds: [],
          excludedIds: [],
          excludedCount: 0,
          chunksWritten: 0,
          stats: { noOp: true },
          startedAt: now,
          finishedAt: now,
        },
      })
      await tx.corpusVersion.update({
        where: { id: targetVersionId },
        data: { status: "ingested" },
      })
      await tx.project.update({
        where: { id: project.id },
        data: { ingestedVersionId: targetVersionId },
      })
    })
    return job
  }

  /**
   * Load Document rows for the given ids and map them to the ClusterDoc shape.
   * The worker trusts only the id and re-resolves the rest, so this is best-effort
   * metadata for the wire (title fallback to id; lane hints from OA fields).
   */
  private static async _loadClusterDocs(
    projectId: string,
    ids: string[],
  ): Promise<ClusterDoc[]> {
    if (ids.length === 0) return []
    const rows = await prisma.document.findMany({
      where: { projectId, openaireId: { in: ids } },
      select: {
        openaireId: true,
        doi: true,
        title: true,
        year: true,
        docType: true,
        lang: true,
        bestAccessRight: true,
        abstract: true,
      },
    })
    return rows.map((doc) => ({
      openaireId: doc.openaireId,
      doi: doc.doi,
      title: doc.title ?? doc.openaireId,
      year: doc.year,
      type: doc.docType ?? "publication",
      lang: doc.lang,
      bestAccessRight: doc.bestAccessRight,
      hasAbstract: Boolean(doc.abstract && doc.abstract.trim() !== ""),
    }))
  }
}
