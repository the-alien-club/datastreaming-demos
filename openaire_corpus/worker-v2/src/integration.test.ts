/**
 * Full-pipeline integration tests — fake clients, real wiring (buildPipeline), real
 * stages, real queue/blob/doc-state semantics. One doc of each B-M1 lane
 * (abstract + metadata) flows end to end to registration, then permanent/transient
 * faults are spiked in to prove skip, retry, terminal failure, and the
 * observability counters all behave. No network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPipeline } from "./build.js";
import { MemoryQueue } from "./core/queue-memory.js";
import { MemoryBlobStore } from "./core/blob.js";
import { createMemoryLogger } from "./core/logger.js";
import { MemoryDocState } from "./domain/doc-state-memory.js";
import type { DocStatus } from "./domain/doc-state.js";
import type { DocRef } from "./domain/types.js";
import {
  FakeOpenAireClient,
  FakeClusterSink,
  FakeEmbedder,
  type FakeProductSpec,
} from "./testing/fakes.js";

interface Harness {
  queue: MemoryQueue;
  docState: MemoryDocState;
  cluster: FakeClusterSink;
  openaire: FakeOpenAireClient;
  events: Array<{ stage: string; kind: string }>;
  seed: (docs: DocRef[]) => Promise<void>;
}

function harness(specs: FakeProductSpec[]): Harness {
  const queue = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const { logger } = createMemoryLogger();
  const docState = new MemoryDocState();
  const cluster = new FakeClusterSink();
  const openaire = new FakeOpenAireClient();
  for (const s of specs) openaire.add(s);
  const events: Array<{ stage: string; kind: string }> = [];

  const pipeline = buildPipeline({
    queue,
    blob,
    log: logger,
    openaire,
    docState,
    embedder: new FakeEmbedder(),
    cluster,
    onOutcome: (e) => events.push({ stage: e.stage, kind: e.kind }),
    config: { fulltextEnabled: false },
  });

  return {
    queue,
    docState,
    cluster,
    openaire,
    events,
    seed: async (docs) => {
      await pipeline.start();
      await pipeline.seed(docs);
    },
  };
}

const ref = (n: string): DocRef => ({ projectId: "p1", docJobId: `job-${n}`, openaireId: n, doi: null });

test("abstract + metadata docs flow end to end to registration", async () => {
  const h = harness([
    { openaireId: "withabs", product: { descriptions: ["A real abstract."] } },
    { openaireId: "noabs", product: { descriptions: [] } },
  ]);
  await h.seed([ref("withabs"), ref("noabs")]);
  await h.queue.idle();

  const counts = await h.docState.statusCounts();
  assert.equal(counts.done, 2, `expected 2 done, got ${JSON.stringify(counts)}`);
  assert.equal(h.cluster.upserts.length, 2);
  const lanes = h.cluster.upserts.map((u) => u.lane).sort();
  assert.deepEqual(lanes, ["abstract", "metadata"], "one abstract-lane, one metadata-lane doc");
});

test("transient 5xx on resolve recovers after retries (doc still completes)", async () => {
  const h = harness([
    { openaireId: "flaky", fault: { status: 502, transientTimes: 2 }, product: { descriptions: ["x"] } },
  ]);
  await h.seed([ref("flaky")]);
  await h.queue.idle();

  const counts = await h.docState.statusCounts();
  assert.equal(counts.done, 1);
  assert.ok(h.openaire.calls.getById >= 3, "should have retried before succeeding");
});

test("permanent resolve failure (404) → skipped, never registered", async () => {
  const h = harness([
    { openaireId: "gone", fault: { permanent: true, status: 404 } },
  ]);
  await h.seed([ref("gone")]);
  await h.queue.idle();

  const counts = await h.docState.statusCounts();
  assert.equal(counts.skipped, 1);
  assert.equal(h.cluster.upserts.length, 0);
});

test("transient resolve exhaustion → doc failed (not orphaned)", async () => {
  const h = harness([
    { openaireId: "down", fault: { alwaysTransient: true, status: 500 } },
  ]);
  await h.seed([ref("down")]);
  await h.queue.idle();

  const counts = await h.docState.statusCounts();
  assert.equal(counts.failed, 1, `expected failed, got ${JSON.stringify(counts)}`);
  assert.equal(h.cluster.upserts.length, 0);
});

test("observability counters reconcile: done + failed + skipped = total", async () => {
  const h = harness([
    { openaireId: "ok1", product: { descriptions: ["a1"] } },
    { openaireId: "ok2", product: { descriptions: [] } },
    { openaireId: "skip1", fault: { permanent: true } },
  ]);
  await h.seed([ref("ok1"), ref("ok2"), ref("skip1")]);
  await h.queue.idle();

  const c = await h.docState.statusCounts();
  const terminal = (["done", "failed", "skipped", "excluded"] as DocStatus[]).reduce(
    (n, s) => n + c[s],
    0,
  );
  assert.equal(terminal, 3, `all 3 docs reach a terminal state: ${JSON.stringify(c)}`);
  assert.equal(c.done, 2);
  assert.equal(c.skipped, 1);
});
