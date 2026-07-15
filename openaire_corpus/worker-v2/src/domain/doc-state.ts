/**
 * Per-doc state — the doc lifecycle + the chunk tally used for the read-model and
 * the terminal callback. In V1 (BnF) this tracked folio fan-in; the OpenAIRE
 * pipeline is linear (one doc = one register), so the "folio" machinery is
 * repurposed to CHUNK accounting: `pagesExpected` = the doc's chunk count, and the
 * chunk table records one row per registered chunk (idempotent per index) so
 * `folioCounts`/`donePageCount` reconcile as chunks-written.
 *
 * Two implementations (memory for tests, pg for prod) behind one interface.
 */
import type { Lane } from "./queues.js";
import type { OaMeta } from "./types.js";

export type DocStatus =
  | "queued"
  | "planned"
  | "fetching"
  | "ready"
  | "processing"
  | "done"
  | "failed"
  | "skipped"
  | "excluded";

export interface DocRow {
  docJobId: string;
  runId: string | null;
  projectId: string;
  openaireId: string;
  lane: Lane | null;
  status: DocStatus;
  /** Expected chunk count once the doc is prepared (null until planned). */
  pagesExpected: number | null;
  pagesDone: number;
  pagesFailed: number;
  meta: OaMeta | null;
  error: string | null;
  skipReason: string | null;
}

/** One failed doc, for the terminal callback's `errors[]` (id + lane-as-stage + reason). */
export interface FailedDoc {
  openaireId: string;
  lane: Lane | null;
  error: string | null;
}

/** Scope for the aggregate read queries — by project, by run, or unscoped. */
export interface DocScope {
  projectId?: string;
  runId?: string;
}

export interface FolioTally {
  expected: number;
  done: number;
  failed: number;
  complete: boolean;
}

export interface DocStateStore {
  /** Create/seed a doc row (idempotent on docJobId). `runId` groups the doc into
   *  its ingest_run; null/omitted for seed-CLI docs that have no run. */
  upsertDoc(d: {
    docJobId: string;
    projectId: string;
    openaireId: string;
    runId?: string | null;
  }): Promise<void>;
  /** Record the plan: lane, expected chunk count, meta. */
  recordPlan(
    docJobId: string,
    plan: { lane: Lane; pagesExpected: number; meta: OaMeta },
  ): Promise<void>;
  /**
   * Record one chunk outcome (idempotent per index). Returns the live tally.
   * Used by register to mark chunks-written so the read-model reconciles.
   */
  recordFolio(docJobId: string, ordre: number, ok: boolean): Promise<FolioTally>;
  /** Set a terminal/intermediate status (+ optional error/skipReason). */
  setStatus(
    docJobId: string,
    status: DocStatus,
    extra?: { error?: string; skipReason?: string },
  ): Promise<void>;
  /**
   * Atomically transition to `status` ONLY if the doc is still pre-terminal
   * (queued/planned/fetching). Returns true iff THIS call won the transition.
   * Concurrency-safe (a conditional UPDATE in pg).
   */
  claimRoute(
    docJobId: string,
    status: "ready" | "failed",
    extra?: { error?: string; skipReason?: string },
  ): Promise<boolean>;
  get(docJobId: string): Promise<DocRow | null>;
  /** Sorted indexes of chunks that landed ok. */
  listOkFolios(docJobId: string): Promise<number[]>;
  /** Aggregate status counts for the progress read-model, optionally scoped. */
  statusCounts(scope?: DocScope): Promise<Record<DocStatus, number>>;
  /** The failed docs of a run — feeds the terminal callback's `errors[]`. */
  listFailedDocs(runId: string): Promise<FailedDoc[]>;
  /** Total ok chunks across the `done` docs of a run — the terminal callback's
   *  display-only `chunksWritten`. */
  donePageCount(runId: string): Promise<number>;
  /**
   * Run-scoped chunk tally for the read-model: `expected` is the sum of
   * pages_expected over the run's planned docs; `done`/`failed` are landed chunks.
   */
  folioCounts(runId: string): Promise<{ expected: number; done: number; failed: number }>;
  /** The doc_job_ids belonging to a run — used to run-scope the shared pg-boss
   *  bucket counts (every job payload carries its docJobId). */
  docJobIdsForRun(runId: string): Promise<string[]>;
}
