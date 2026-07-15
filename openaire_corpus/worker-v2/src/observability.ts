/**
 * Progress read-model — a pure aggregation over what the pipeline already
 * persists: the per-doc status counts (DocStateStore) + each bucket's job-state
 * counts (QueueClient.counts). No new tracking infra. This is the payload the
 * Ingérer UI polls.
 *
 * Design invariant (the anti-V1 rule): `failed` / `skipped` / `excluded` are
 * ALWAYS surfaced and the doc totals ALWAYS reconcile —
 *   done + running + queued + failed + skipped + excluded = total.
 * A UI that shows only done/running/queued lies about completion; this model
 * refuses to. ETA = the embed-phase bucket depth ÷ an embed rate, so a long queue
 * reads as "~Xh remaining", not a hang.
 *
 * The per-stage buckets map into the app's three headline groups:
 *   Deduplication ← resolve
 *   Embedding     ← fetchPdf + extract + prepare + embed
 *   Indexing      ← register
 * The BnF-era `folios`/`foliosAhead`/rate fields are kept (populated from the doc
 * CHUNK counts) so the app's ClusterQueueProgress reader doesn't break.
 */
import type { DocStateStore, DocStatus } from "./domain/doc-state.js";
import type { QueueClient } from "./core/types.js";
import { Q } from "./domain/queues.js";

export interface StageProgress {
  done: number;
  running: number;
  queued: number;
  failed: number;
}

export interface ProgressReport {
  /** Per-doc terminal/in-flight status (the headline reconciliation). */
  docs: Record<DocStatus, number>;
  docsTotal: number;
  /** "Docs finished" headline — docs fully registered. */
  docsFinished: number;
  /** Per-stage bucket counts, keyed by stage name — plus the three headline groups
   *  (dedup/embedding/indexing) merged in. */
  stages: Record<string, StageProgress>;
  /** Run-scoped chunk tally — the honest written/total for the headline (NOT the
   *  shared pg-boss bucket counts, which accumulate across runs). Kept under the
   *  `folios` name the app's ClusterQueueProgress reader expects. */
  folios: { expected: number; done: number; failed: number };
  /** Docs from OTHER concurrent runs still pending in the shared embed-phase queues
   *  — the work "ahead of you". 0 when this run has the queues to itself. Kept under
   *  the `foliosAhead` name the app UI reads. */
  foliosAhead: number;
  /** The rate (docs/min) the ETA assumes — surfaced so the UI can headline it. */
  fetchRatePerMin: number;
  /** Kept for the app UI's ClusterQueueProgress reader (no longer a binding cap). */
  manifestRatePerMin: number;
  /** Estimated seconds remaining (embed-phase backlog ÷ rate), or null. */
  etaSeconds: number | null;
  /** Optional spend/budget passthrough, when configured. */
  paidOcr?: { spentUsd: number; budgetUsd: number | null };
  /** True iff the doc totals reconcile — a guard the caller can assert/log. */
  reconciles: boolean;
}

export interface ProgressOpts {
  projectId?: string;
  /** Scope the doc-status reconciliation to one ingest_run (the Ingérer poll path).
   *  Takes precedence over projectId. Note: the per-stage bucket counts come from the
   *  shared pg-boss queues and are NOT run-scoped — fine for the prototype's
   *  one-run-at-a-time cadence; the headline doc reconciliation IS run-scoped. */
  runId?: string;
  /** Processing rate (docs/min) for the ETA (default 300). */
  fetchRatePerMin?: number;
  /** Kept for the app UI passthrough (default 42). */
  manifestRatePerMin?: number;
  paidOcr?: { spentUsd: number; budgetUsd: number | null };
}

/** The buckets surfaced in the UI, in pipeline order. */
const STAGE_QUEUES: Array<{ key: string; queue: string }> = [
  { key: "resolve", queue: Q.resolve },
  { key: "fetchPdf", queue: Q.fetchPdf },
  { key: "extract", queue: Q.extract },
  { key: "prepare", queue: Q.prepare },
  { key: "embed", queue: Q.embed },
  { key: "register", queue: Q.register },
];

/** The three headline groups the app's ClusterQueueProgress reads. Each sums the
 *  bucket counts of its member stages. */
const HEADLINE_GROUPS: Record<string, string[]> = {
  dedup: ["resolve"],
  embedding: ["fetchPdf", "extract", "prepare", "embed"],
  indexing: ["register"],
};

export async function buildProgress(
  docState: DocStateStore,
  queue: QueueClient,
  opts: ProgressOpts = {},
): Promise<ProgressReport> {
  const docs = await docState.statusCounts(
    opts.runId !== undefined
      ? { runId: opts.runId }
      : opts.projectId !== undefined
        ? { projectId: opts.projectId }
        : undefined,
  );
  const docsTotal = (Object.values(docs) as number[]).reduce((a, b) => a + b, 0);

  // RUN-SCOPE the per-stage bucket counts. The pg-boss buckets are SHARED across
  // concurrently-running ingests, so the global counts would show one run's
  // describe/OCR activity on another run's card (the live "job 2 shows job 1's
  // numbers" bug). Every job payload carries its docJobId, so we count only the
  // jobs belonging to THIS run's docs. Without a runId (the status CLI) we fall
  // back to the global counts.
  const docJobIds = opts.runId ? await docState.docJobIdsForRun(opts.runId) : null;
  const stages: Record<string, StageProgress> = {};
  for (const { key, queue: name } of STAGE_QUEUES) {
    const c = docJobIds ? await queue.countsForDocs(name, docJobIds) : await queue.counts(name);
    stages[key] = { done: c.completed, running: c.running, queued: c.queued, failed: c.failed };
  }

  // Group the buckets into the three headline groups the app reads.
  const headline: Record<string, StageProgress> = {};
  for (const [group, members] of Object.entries(HEADLINE_GROUPS)) {
    headline[group] = members.reduce(
      (acc, key) => {
        const s = stages[key];
        if (!s) return acc;
        return {
          done: acc.done + s.done,
          running: acc.running + s.running,
          queued: acc.queued + s.queued,
          failed: acc.failed + s.failed,
        };
      },
      { done: 0, running: 0, queued: 0, failed: 0 } as StageProgress,
    );
  }

  // Docs from OTHER runs still pending in the shared embed-phase queues = global
  // pending − this run's pending. Only meaningful when run-scoped. (Kept under the
  // `foliosAhead` name the app UI reads.)
  const embedPhase = HEADLINE_GROUPS.embedding!;
  let foliosAhead = 0;
  if (docJobIds) {
    let globalPending = 0;
    for (const key of embedPhase) {
      const name = STAGE_QUEUES.find((s) => s.key === key)?.queue;
      if (!name) continue;
      const g = await queue.counts(name);
      globalPending += g.running + g.queued;
    }
    const runPending = embedPhase.reduce(
      (n, key) => n + (stages[key]?.running ?? 0) + (stages[key]?.queued ?? 0),
      0,
    );
    foliosAhead = Math.max(0, globalPending - runPending);
  }

  // ETA: the binding phase is the embed pipeline (resolve + fetch/extract/prepare/
  // embed backlog + the docs queued ahead of you) ÷ rate.
  const rate = opts.fetchRatePerMin ?? 300;
  const backlog =
    embedPhase.reduce(
      (n, key) => n + (stages[key]?.queued ?? 0) + (stages[key]?.running ?? 0),
      0,
    ) +
    (stages.resolve?.queued ?? 0) +
    (stages.resolve?.running ?? 0) +
    foliosAhead;
  const etaSeconds: number | null = rate > 0 ? Math.ceil((backlog / rate) * 60) : null;

  const reconciles = docsTotal === sumStatuses(docs);

  // Run-scoped chunk tally for the headline (kept under the `folios` name the app
  // UI reads). Only meaningful with a runId; the unscoped status CLI gets zeros.
  const folios = opts.runId
    ? await docState.folioCounts(opts.runId)
    : { expected: 0, done: 0, failed: 0 };

  const report: ProgressReport = {
    docs,
    docsTotal,
    docsFinished: docs.done,
    stages: { ...stages, ...headline },
    folios,
    foliosAhead,
    fetchRatePerMin: rate,
    manifestRatePerMin: opts.manifestRatePerMin ?? 42,
    etaSeconds,
    reconciles,
  };
  if (opts.paidOcr) report.paidOcr = opts.paidOcr;
  return report;
}

function sumStatuses(docs: Record<DocStatus, number>): number {
  const all: DocStatus[] = [
    "queued",
    "planned",
    "fetching",
    "ready",
    "processing",
    "done",
    "failed",
    "skipped",
    "excluded",
  ];
  return all.reduce((n, s) => n + docs[s], 0);
}
