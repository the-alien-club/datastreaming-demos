/**
 * Full-text end-to-end (fake clients, real wiring with fulltextEnabled): an OPEN
 * product with a candidate PDF resolves → fetchPdf → extract → prepare (page
 * chunks) → embed → register, and a doc whose candidates all fail degrades to the
 * abstract lane but still completes. No network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPipeline } from "./build.js";
import { MemoryQueue } from "./core/queue-memory.js";
import { MemoryBlobStore } from "./core/blob.js";
import { createMemoryLogger } from "./core/logger.js";
import { MemoryDocState } from "./domain/doc-state-memory.js";
import type { DocRef } from "./domain/types.js";
import {
  FakeOpenAireClient,
  FakeClusterSink,
  FakeEmbedder,
  FakePdfExtractor,
  FakePdfFetcher,
} from "./testing/fakes.js";

const OPEN_INSTANCE = {
  accessRight: { label: "OPEN" },
  urls: ["https://arxiv.org/pdf/2101.00001"],
};

test("fulltext: OPEN doc with a PDF → fulltext-lane register with page chunks", async () => {
  const queue = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const { logger } = createMemoryLogger();
  const docState = new MemoryDocState();
  const cluster = new FakeClusterSink();
  const openaire = new FakeOpenAireClient().add({
    openaireId: "ft1",
    product: { descriptions: ["abs"], instances: [OPEN_INSTANCE] },
  });
  const fetcher = new FakePdfFetcher().add("https://arxiv.org/pdf/2101.00001", {
    ok: true,
    bytes: Buffer.from("%PDF-1.7 real"),
  });
  const extractor = new FakePdfExtractor({ pages: ["Body page one.".padEnd(300, "x")] });

  const pipeline = buildPipeline({
    queue,
    blob,
    log: logger,
    openaire,
    docState,
    embedder: new FakeEmbedder(),
    cluster,
    pdfFetcher: fetcher,
    pdfExtractor: extractor,
    config: { fulltextEnabled: true },
  });
  await pipeline.start();
  await pipeline.seed([{ projectId: "p1", docJobId: "j1", openaireId: "ft1", doi: null }]);
  await queue.idle();

  const counts = await docState.statusCounts();
  assert.equal(counts.done, 1, JSON.stringify(counts));
  assert.equal(cluster.upserts.length, 1);
  assert.equal(cluster.upserts[0]!.lane, "fulltext");
  // lead abstract chunk + one page chunk.
  assert.equal(cluster.upserts[0]!.chunks, 2);
});

test("fulltext: all PDF candidates fail → degrades to abstract lane but completes", async () => {
  const queue = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const { logger } = createMemoryLogger();
  const docState = new MemoryDocState();
  const cluster = new FakeClusterSink();
  const openaire = new FakeOpenAireClient().add({
    openaireId: "ft2",
    product: { descriptions: ["abs"], instances: [OPEN_INSTANCE] },
  });
  const fetcher = new FakePdfFetcher().add("https://arxiv.org/pdf/2101.00001", {
    ok: false,
    failure: "paywalled",
  });
  const extractor = new FakePdfExtractor({ pages: [] });

  const pipeline = buildPipeline({
    queue,
    blob,
    log: logger,
    openaire,
    docState,
    embedder: new FakeEmbedder(),
    cluster,
    pdfFetcher: fetcher,
    pdfExtractor: extractor,
    config: { fulltextEnabled: true },
  });
  await pipeline.start();
  await pipeline.seed([{ projectId: "p1", docJobId: "j2", openaireId: "ft2", doi: null }]);
  await queue.idle();

  const counts = await docState.statusCounts();
  assert.equal(counts.done, 1, JSON.stringify(counts));
  assert.equal(cluster.upserts[0]!.lane, "abstract", "degraded to abstract, still registered");
});
