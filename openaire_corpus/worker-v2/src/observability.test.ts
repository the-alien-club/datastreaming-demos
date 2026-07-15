/**
 * Progress read-model tests — drive the memory stores/queue, then assert the report
 * reconciles and exposes failed/skipped (never hides them), the ETA tracks the
 * embed-phase backlog, and the per-stage buckets are run-scoped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProgress } from "./observability.js";
import { MemoryQueue } from "./core/queue-memory.js";
import { MemoryDocState } from "./domain/doc-state-memory.js";
import { Q } from "./domain/queues.js";

test("reconciles: done + failed + skipped = total, and surfaces failures", async () => {
  const ds = new MemoryDocState();
  const q = new MemoryQueue();
  for (const [id, status] of [
    ["a", "done"],
    ["b", "done"],
    ["c", "failed"],
    ["d", "skipped"],
  ] as const) {
    await ds.upsertDoc({ docJobId: id, projectId: "p1", openaireId: `oa::${id}` });
    await ds.setStatus(id, status);
  }

  const report = await buildProgress(ds, q, { projectId: "p1" });
  assert.equal(report.docsTotal, 4);
  assert.equal(report.docsFinished, 2);
  assert.equal(report.docs.failed, 1);
  assert.equal(report.docs.skipped, 1);
  assert.ok(report.reconciles, "doc totals must reconcile");
});

test("ETA derives from the embed-phase backlog ÷ rate", async () => {
  const ds = new MemoryDocState();
  const q = new MemoryQueue();
  // Park 600 docs on the embed queue with no worker → all stay 'queued'.
  await q.sendMany(
    Q.embed,
    Array.from({ length: 600 }, (_, i) => ({ index: i })),
  );

  const report = await buildProgress(ds, q, { fetchRatePerMin: 300 });
  // 600 / 300 * 60 = 120 s.
  assert.equal(report.stages.embed?.queued, 600);
  assert.equal(report.etaSeconds, 120);
});

test("paid spend is surfaced when a budget is configured", async () => {
  const ds = new MemoryDocState();
  const q = new MemoryQueue();
  await ds.upsertDoc({ docJobId: "x", projectId: "p1", openaireId: "oa::x" });
  const report = await buildProgress(ds, q, {
    projectId: "p1",
    paidOcr: { spentUsd: 1.5, budgetUsd: 10 },
  });
  assert.deepEqual(report.paidOcr, { spentUsd: 1.5, budgetUsd: 10 });
});

test("stages are run-scoped: one run's card excludes another concurrent run's jobs", async () => {
  const ds = new MemoryDocState();
  const q = new MemoryQueue();
  // Two concurrent runs sharing the pg-boss buckets: A (2 docs), B (1 doc).
  await ds.upsertDoc({ docJobId: "a1", runId: "runA", projectId: "p", openaireId: "oa::a1" });
  await ds.upsertDoc({ docJobId: "a2", runId: "runA", projectId: "p", openaireId: "oa::a2" });
  await ds.upsertDoc({ docJobId: "b1", runId: "runB", projectId: "p", openaireId: "oa::b1" });
  // prepare bucket: 2 jobs belong to A, 5 to B.
  await q.sendMany(Q.prepare, [{ docJobId: "a1" }, { docJobId: "a2" }]);
  await q.sendMany(Q.prepare, Array.from({ length: 5 }, () => ({ docJobId: "b1" })));
  // embed bucket: 3 for A, 30 for B.
  await q.sendMany(Q.embed, Array.from({ length: 3 }, (_, i) => ({ docJobId: "a1", index: i })));
  await q.sendMany(Q.embed, Array.from({ length: 30 }, (_, i) => ({ docJobId: "b1", index: i })));

  const a = await buildProgress(ds, q, { runId: "runA", fetchRatePerMin: 300 });
  assert.equal(a.stages.prepare?.queued, 2, "run A sees only its 2 prepare jobs");
  assert.equal(a.stages.embed?.queued, 3, "run A sees only its 3 embed jobs");
  // The embedding headline group sums fetchPdf+extract+prepare+embed for run A.
  assert.equal(a.stages.embedding?.queued, 5, "run A embedding group = 2 prepare + 3 embed");
  // B's pending embed-phase work is "ahead of you" in the shared queues.
  assert.equal(a.foliosAhead, 35);

  const b = await buildProgress(ds, q, { runId: "runB", fetchRatePerMin: 300 });
  assert.equal(b.stages.prepare?.queued, 5);
  assert.equal(b.stages.embed?.queued, 30);
  assert.equal(b.foliosAhead, 5);
});
