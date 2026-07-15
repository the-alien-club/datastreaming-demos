// lib/cluster/contracts.ts
// Pure types shared between this app and the cluster team.
// No runtime code — safe to import on both client and server.

export interface ClusterDoc {
  /** The OpenAIRE id — the ONLY field the worker trusts; it re-resolves the
   *  rest of the metadata (and mines PDF candidates) from the Graph API. */
  openaireId: string
  /** DOI (bare, no https prefix) for logging/display; null for DOI-less products. */
  doi: string | null
  title: string
  year: number | null
  /** publication | dataset | software | other */
  type: string
  lang: string | null
  /** OPEN | EMBARGO | RESTRICTED | CLOSED | UNKNOWN — lets the worker predict the
   *  fulltext vs abstract lane before it re-resolves, and the UI pre-badge OA. */
  bestAccessRight: string | null
  /** Whether the resolved metadata carried an abstract (lane prediction). */
  hasAbstract: boolean
}

export interface ClusterIngestRequest {
  projectId: string
  targetVersionId: string
  /**
   * The app-side IngestJob id. Carried explicitly on the wire so the cluster
   * worker does not need to parse it out of callbackUrl. Both sides of the
   * contract own this field.
   */
  appJobId: string
  added: ClusterDoc[]
  removed: string[]
  callbackUrl: string
  callbackSecret: string
}

/**
 * Live queue-status read-model returned by the worker's `GET /progress/:runId`
 * (worker-v2 `buildProgress`). Polled by the Ingérer page to render the staged
 * pipeline as it drains — the BnF fetch bucket is the headline bottleneck. This
 * is a LIVE-UX payload only; it is NOT the commit signal (that is the terminal
 * ClusterProgressEvent below). Mirror of the worker's ProgressReport.
 */
export interface ClusterQueueStage {
  done: number
  running: number
  queued: number
  failed: number
}

export interface ClusterQueueProgress {
  /** Per-doc status counts (the headline reconciliation), keyed by worker DocStatus. */
  docs: Record<string, number>
  docsTotal: number
  /** Docs fully registered into the index. */
  docsFinished: number
  /** Per-stage bucket counts, keyed by worker stage name (fetch, metadata, …). */
  stages: Record<string, ClusterQueueStage>
  /** Run-scoped BnF-fetch folio tally (récupérés/total) — honest, not the shared
   *  pg-boss bucket counts. `expected` grows as metadata resolves more docs. */
  folios: { expected: number; done: number; failed: number }
  /** Folios from OTHER concurrent runs still pending in the shared BnF-fetch queue.
   *  The rate cap is shared, so this is the work "ahead of you". 0 when alone.
   *  Optional: older workers don't send it. */
  foliosAhead?: number
  /** The binding BnF fetch rate (folios/min) the ETA assumes. */
  fetchRatePerMin: number
  /** The IIIF manifest rate (manifests/min) — the metadata lane's binding cap. */
  manifestRatePerMin: number
  /** Estimated seconds remaining, or null when not computable. */
  etaSeconds: number | null
  /** True iff the doc totals reconcile (a UI guard against under-reporting). */
  reconciles: boolean
}

export type ClusterProgressEvent =
  | {
      stage: "dedup" | "embed" | "index"
      fraction: number
      counters: Record<string, number>
    }
  | { stage: "done"; chunksWritten: number; stats: Record<string, unknown> }
  | {
      stage: "failed"
      error: string
      partialStats?: Record<string, unknown>
    }
