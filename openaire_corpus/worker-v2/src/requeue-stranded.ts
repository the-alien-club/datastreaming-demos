/**
 * Recovery CLI — requeue stranded docs back into the pipeline head.
 *
 * A "stranded" doc is one still in a non-terminal status (queued/planned/fetching/
 * ready/processing) whose stage message died in the queue (exhausted retries during
 * an outage, or a worker restart mid-call) and will never redeliver. Such a doc
 * sits non-terminal forever, so the run can never complete. This re-sends a fresh
 * DocRef onto the resolve queue; the running worker picks it up and drives it to
 * done/failed. Idempotent: register dedups on its S3 receipt, so re-processing a
 * doc that later succeeds is harmless.
 *
 *   node --import tsx src/requeue-stranded.ts <runId>
 */
import { Pool } from "pg";

import { loadConfig } from "./config.js";
import { PgBossQueue } from "./core/queue-pgboss.js";
import { PgDocState } from "./domain/doc-state-pg.js";
import { Q } from "./domain/queues.js";
import type { DocRef } from "./domain/types.js";

const NON_TERMINAL = ["queued", "planned", "fetching", "ready", "processing"];

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) {
    console.error("usage: node --import tsx src/requeue-stranded.ts <runId>");
    process.exit(2);
  }

  const cfg = loadConfig();
  const queue = new PgBossQueue(cfg.databaseUrl);
  await queue.start();
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  const docState = new PgDocState(pool);

  const { rows } = await pool.query<{ doc_job_id: string }>(
    `SELECT doc_job_id FROM sandbox_ingest_v2.document_ingest_job_v2
     WHERE run_id = $1 AND status = ANY($2)`,
    [runId, NON_TERMINAL],
  );
  console.log(`[requeue] ${rows.length} non-terminal (stranded) docs in run ${runId}`);

  let requeued = 0;
  for (const { doc_job_id } of rows) {
    const row = await docState.get(doc_job_id);
    if (!row) continue;
    const ref: DocRef = {
      projectId: row.projectId,
      docJobId: row.docJobId,
      openaireId: row.openaireId,
      doi: row.meta?.doi ?? null,
      runId: row.runId,
    };
    await queue.send(Q.resolve, ref);
    requeued++;
    console.log(`[requeue] ${row.openaireId} → ${Q.resolve}`);
  }
  console.log(`[requeue] done — requeued ${requeued} docs`);

  await queue.stop();
  await pool.end();
}

main().catch((err) => {
  console.error("[requeue] fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
