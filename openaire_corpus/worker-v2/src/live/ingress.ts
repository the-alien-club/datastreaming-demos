/**
 * HTTP ingress — the app↔worker inbound seam (`POST /ingest`). Validates the
 * app's ClusterIngestRequest, opens an ingest_run (callback coords + target
 * version + app job id), and seeds the run's ARKs into the metadata bucket. The
 * returned runId IS the clusterJobId the app stores and polls.
 *
 * Self-contained on purpose (the dual-undici lesson): v2 re-resolves each doc's
 * metadata itself in the resolve stage, so the only fields it trusts from the app's
 * `added[]` are the `openaireId` (identity) and the `doi` (a fallback carried
 * through when the Graph API record has no doi pid). `removed[]` is ignored —
 * removal is committed app-side; v2 has no delete path.
 */
import { randomUUID } from "node:crypto";

import type { QueueClient } from "../core/types.js";
import type { DocStateStore } from "../domain/doc-state.js";
import type { RunStore } from "../domain/run.js";
import { Q } from "../domain/queues.js";
import type { DocRef } from "../domain/types.js";

export interface IngressDeps {
  runStore: RunStore;
  docState: DocStateStore;
  queue: QueueClient;
}

/** One doc from the app's `added[]` — only the identity + doi fallback are trusted. */
export interface ParsedDoc {
  openaireId: string;
  doi: string | null;
}

/** The fields v2 needs from the app's ClusterIngestRequest. */
export interface ParsedIngestRequest {
  projectId: string;
  targetVersionId: string;
  appJobId: string;
  ids: ParsedDoc[];
  callbackUrl: string;
  callbackSecret: string;
}

export interface IngressResult {
  runId: string;
  totalDocs: number;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Parse + validate the raw request body into the subset v2 consumes. Returns a
 * discriminated result so the HTTP handler maps a parse failure to a 400 with the
 * specific reason rather than a generic crash. Every required field is checked —
 * no empty defaults (platform CLAUDE_ERROR_PATTERNS §10).
 */
export function parseIngestRequest(
  raw: unknown,
): { ok: true; value: ParsedIngestRequest } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = raw as Record<string, unknown>;

  const projectId = asString(b.projectId);
  if (!projectId) return { ok: false, error: "projectId is required" };
  const targetVersionId = asString(b.targetVersionId);
  if (!targetVersionId) return { ok: false, error: "targetVersionId is required" };
  const appJobId = asString(b.appJobId);
  if (!appJobId) return { ok: false, error: "appJobId is required" };
  const callbackUrl = asString(b.callbackUrl);
  if (!callbackUrl) return { ok: false, error: "callbackUrl is required" };
  const callbackSecret = asString(b.callbackSecret);
  if (!callbackSecret) return { ok: false, error: "callbackSecret is required" };

  if (!Array.isArray(b.added)) return { ok: false, error: "added must be an array" };
  const ids: ParsedDoc[] = [];
  for (const [i, doc] of b.added.entries()) {
    if (!doc || typeof doc !== "object") {
      return { ok: false, error: `added[${i}] must be an object` };
    }
    const rec = doc as Record<string, unknown>;
    const openaireId = asString(rec.openaireId);
    if (!openaireId) return { ok: false, error: `added[${i}].openaireId is required` };
    ids.push({ openaireId, doi: asString(rec.doi) });
  }

  return {
    ok: true,
    value: { projectId, targetVersionId, appJobId, ids, callbackUrl, callbackSecret },
  };
}

/**
 * Open a run and seed its ARKs. Creates the ingest_run row first (so the callback
 * coordinates exist before any doc can complete and trigger a terminal emit), then
 * upserts one doc-state row per ARK and fans them onto the metadata bucket.
 *
 * An empty `arks` (a removal-only delta) creates a zero-doc run that completes
 * immediately — the caller emits its terminal event so the app commits the
 * removal. We never short-circuit it away here; the run row must exist for the
 * callback to fire.
 */
export async function createRunAndSeed(
  deps: IngressDeps,
  req: ParsedIngestRequest,
): Promise<IngressResult> {
  const runId = randomUUID();
  const refs: DocRef[] = req.ids.map((d) => ({
    projectId: req.projectId,
    docJobId: randomUUID(),
    openaireId: d.openaireId,
    doi: d.doi,
    runId,
  }));

  await deps.runStore.create({
    runId,
    appJobId: req.appJobId,
    projectId: req.projectId,
    callbackUrl: req.callbackUrl,
    callbackSecret: req.callbackSecret,
    targetVersionId: req.targetVersionId,
    totalDocs: refs.length,
  });

  for (const ref of refs) await deps.docState.upsertDoc(ref);
  if (refs.length > 0) await deps.queue.sendMany(Q.resolve, refs);

  return { runId, totalDocs: refs.length };
}
