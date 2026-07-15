/**
 * Seed CLI — enqueue documents into the V2 pipeline head (the resolve bucket).
 * Creates a `document_ingest_job_v2` row per OpenAIRE id and sends a DocRef onto
 * the resolve queue; the running worker (main.ts) picks them up. Kept
 * transport-only so it can run against the same pg-boss + Postgres the worker uses.
 *
 *   npx tsx src/seed.ts <projectId> <openaireId...>
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { loadConfig } from "./config.js";
import { PgBossQueue } from "./core/queue-pgboss.js";
import { PgDocState } from "./domain/doc-state-pg.js";
import { Q } from "./domain/queues.js";
import type { DocRef } from "./domain/types.js";

async function main(): Promise<void> {
  const [projectId, ...openaireIds] = process.argv.slice(2);
  if (!projectId || openaireIds.length === 0) {
    console.error("usage: tsx src/seed.ts <projectId> <openaireId...>");
    process.exit(2);
  }

  const cfg = loadConfig();
  const queue = new PgBossQueue(cfg.databaseUrl);
  await queue.start();
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  const docState = new PgDocState(pool);
  await docState.migrate();

  const refs: DocRef[] = openaireIds.map((openaireId) => ({
    projectId,
    docJobId: randomUUID(),
    openaireId,
    doi: null,
  }));
  for (const ref of refs) {
    await docState.upsertDoc(ref);
  }
  await queue.sendMany(Q.resolve, refs);
  console.log(`seeded ${refs.length} docs into ${Q.resolve} for project ${projectId}`);
  for (const r of refs) console.log(`  ${r.docJobId}  ${r.openaireId}`);

  await queue.stop();
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
