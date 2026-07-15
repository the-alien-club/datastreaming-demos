/**
 * Unit tests for the Pipeline runner (core/pipeline.ts) — the thin composition
 * root. The runner owns nothing clever: it holds the queue transport + the list
 * of stages, starts every stage's worker loop, seeds the head queue, and stops.
 *
 * This suite proves the wiring against the memory collaborators (MemoryQueue +
 * MemoryBlobStore + memory logger) with tiny concrete stages built by extending
 * PipelineStage:
 *
 *   - a HEAD stage on Q.resolve → Q.prepare that emits one item and records the
 *     id it processed;
 *   - a TAIL stage on Q.prepare (no output queue) that records what it received.
 *
 * Data flows stage → stage only through the queues, so observing the tail stage's
 * record proves both stages were started and the runner wired them end to end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryBlobStore } from "./blob.js";
import { createMemoryLogger } from "./logger.js";
import { Pipeline } from "./pipeline.js";
import { MemoryQueue } from "./queue-memory.js";
import { PipelineStage, type StageDeps } from "./stage.js";
import { Q } from "../domain/queues.js";
import type { DocRef, ResolvedDoc } from "../domain/types.js";
import type { StageContext, StageOutcome } from "./types.js";

/**
 * HEAD stage: consumes the seeded DocRef off Q.resolve, records its id, and emits
 * one ResolvedDoc onto Q.prepare. Stands in for the resolve stage.
 */
class HeadStage extends PipelineStage<DocRef, ResolvedDoc> {
  readonly name = "head";
  readonly inputQueue = Q.resolve;
  override readonly outputQueue = Q.prepare;
  override readonly concurrency = 1;

  /** ids seen by process(), in arrival order. */
  readonly seen: string[] = [];

  override async process(payload: DocRef, _ctx: StageContext): Promise<StageOutcome<ResolvedDoc>> {
    this.seen.push(payload.openaireId);
    return {
      kind: "emit",
      items: [
        {
          projectId: payload.projectId,
          docJobId: payload.docJobId,
          openaireId: payload.openaireId,
          doi: payload.doi,
          lane: "abstract",
          meta: {
            title: "t",
            abstract: "a",
            authors: [],
            year: null,
            venue: null,
            publisher: null,
            type: "publication",
            doi: payload.doi,
            bestAccessRight: null,
            openAccessColor: null,
            subjects: [],
          },
        },
      ],
    };
  }
}

/**
 * TAIL stage: consumes ResolvedDocs off Q.prepare and records them. No output
 * queue — its records prove data flowed all the way through.
 */
class TailStage extends PipelineStage<ResolvedDoc, never> {
  readonly name = "tail";
  readonly inputQueue = Q.prepare;
  override readonly concurrency = 1;

  /** Every ResolvedDoc this stage received. */
  readonly received: ResolvedDoc[] = [];

  override async process(payload: ResolvedDoc, _ctx: StageContext): Promise<StageOutcome<never>> {
    this.received.push(payload);
    return { kind: "done" };
  }
}

/** Stand up the shared collaborators (one MemoryQueue + memory blob + memory logger). */
function deps(): {
  deps: StageDeps;
  queue: MemoryQueue;
  lines: Array<Record<string, unknown>>;
} {
  const { logger, lines } = createMemoryLogger();
  const blob = new MemoryBlobStore();
  const queue = new MemoryQueue();
  return { deps: { queue, blob, log: logger }, queue, lines };
}

const DOC: DocRef = { projectId: "p1", docJobId: "d1", openaireId: "oa::doc1", doi: null };

test("start() starts every stage — data flows head → tail through the runner", async () => {
  const d = deps();
  const head = new HeadStage(d.deps);
  const tail = new TailStage(d.deps);
  const pipeline = new Pipeline(d.queue, [head, tail], d.deps.log);

  await pipeline.start();

  // Seed the head queue directly, then let the whole pipeline drain.
  await d.queue.send(Q.resolve, DOC);
  await d.queue.idle();

  assert.deepEqual(head.seen, [DOC.openaireId], "head stage started and processed the seeded DocRef");
  assert.equal(tail.received.length, 1, "tail stage started and received the emitted item");
  assert.equal(tail.received[0]?.openaireId, DOC.openaireId, "the item that reached the tail carries the same id");

  const startedLog = d.lines.find((l) => l.event === "pipeline_started");
  assert.ok(startedLog, "pipeline_started was logged");
  assert.deepEqual(startedLog?.stages, ["head", "tail"], "both stage names logged at start");
});

test("seed() enqueues to Q.metadata — the head stage processes the DocRef", async () => {
  const d = deps();
  const head = new HeadStage(d.deps);
  const tail = new TailStage(d.deps);
  const pipeline = new Pipeline(d.queue, [head, tail], d.deps.log);

  await pipeline.start();
  await pipeline.seed([DOC]);
  await d.queue.idle();

  assert.deepEqual(head.seen, [DOC.openaireId], "seed() landed the DocRef on Q.resolve → head processed it");
  assert.equal(tail.received.length, 1, "and it flowed on to the tail");

  const seededLog = d.lines.find((l) => l.event === "pipeline_seeded");
  assert.ok(seededLog, "pipeline_seeded was logged");
  assert.equal(seededLog?.count, 1, "seeded count logged");
});

test("seed([]) is a no-op — nothing enqueued, nothing processed, no throw", async () => {
  const d = deps();
  const head = new HeadStage(d.deps);
  const tail = new TailStage(d.deps);
  const pipeline = new Pipeline(d.queue, [head, tail], d.deps.log);

  await pipeline.start();
  await pipeline.seed([]); // must not throw
  await d.queue.idle();

  const counts = await d.queue.counts(Q.resolve);
  assert.equal(counts.queued, 0, "no item queued on Q.resolve");
  assert.equal(counts.running, 0, "no item running on Q.resolve");
  assert.equal(counts.completed, 0, "no item completed on Q.resolve");
  assert.equal(counts.failed, 0, "no item failed on Q.resolve");
  assert.deepEqual(head.seen, [], "head stage saw nothing");

  const seededLog = d.lines.find((l) => l.event === "pipeline_seeded");
  assert.equal(seededLog, undefined, "empty seed does not even log pipeline_seeded");
});

test("double start() throws", async () => {
  const d = deps();
  const head = new HeadStage(d.deps);
  const tail = new TailStage(d.deps);
  const pipeline = new Pipeline(d.queue, [head, tail], d.deps.log);

  await pipeline.start();
  await assert.rejects(() => pipeline.start(), /already started/, "second start() rejects");
});

test("duplicate input queue is rejected at construction", () => {
  const d = deps();
  // Two stages both bound to Q.metadata → ambiguous worker registration.
  const a = new HeadStage(d.deps);
  const b = new HeadStage(d.deps);
  assert.throws(
    () => new Pipeline(d.queue, [a, b], d.deps.log),
    /same input queue/,
    "constructing with two stages on the same input queue throws",
  );
});

test("stop() stops the queue — workers cleared, a later send is not processed", async () => {
  const d = deps();
  const head = new HeadStage(d.deps);
  const tail = new TailStage(d.deps);
  const pipeline = new Pipeline(d.queue, [head, tail], d.deps.log);

  await pipeline.start();
  await pipeline.stop();

  // MemoryQueue.stop() clears all registered workers. A subsequent send therefore
  // has no worker to pick it up — it stays queued and the head stage never sees it.
  await d.queue.send(Q.resolve, DOC);
  // Give any (incorrectly surviving) worker a chance to run before asserting.
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(head.seen, [], "no worker processed the post-stop send");
  const counts = await d.queue.counts(Q.resolve);
  assert.equal(counts.queued, 1, "the item is still sitting queued — no worker drained it");
  assert.equal(counts.completed, 0, "nothing completed after stop");

  const stoppedLog = d.lines.find((l) => l.event === "pipeline_stopped");
  assert.ok(stoppedLog, "pipeline_stopped was logged");
});
