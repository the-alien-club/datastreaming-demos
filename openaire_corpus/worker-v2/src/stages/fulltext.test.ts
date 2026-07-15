/**
 * Full-text lane stage tests (fetch-pdf + extract) in isolation, on a MemoryQueue +
 * MemoryBlobStore + MemoryDocState. Proves: a valid PDF is stored + forwarded to
 * extract; every-candidate-failure degrades to prepare; a scanned/empty PDF
 * degrades; extracted text flows to prepare with pageTexts. Never drops a doc.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryQueue } from "../core/queue-memory.js";
import { MemoryBlobStore } from "../core/blob.js";
import { createMemoryLogger } from "../core/logger.js";
import type { StageDeps } from "../core/stage.js";
import { MemoryDocState } from "../domain/doc-state-memory.js";
import { keys } from "../domain/keys.js";
import { Q } from "../domain/queues.js";
import type { OaMeta, ResolvedDoc } from "../domain/types.js";
import { FetchPdfStage } from "./fetch-pdf.js";
import { ExtractStage, median } from "./extract.js";
import { FakePdfExtractor, FakePdfFetcher } from "../testing/fakes.js";

const ID = "oa::ft";

const META: OaMeta = {
  title: "FT Title",
  abstract: "The abstract.",
  authors: [],
  year: 2020,
  venue: null,
  publisher: null,
  type: "publication",
  doi: null,
  bestAccessRight: "OPEN",
  openAccessColor: "gold",
  subjects: [],
};

function deps(q: MemoryQueue, blob: MemoryBlobStore): StageDeps {
  const { logger } = createMemoryLogger();
  return { queue: q, blob, log: logger };
}

function resolved(candidates: ResolvedDoc["pdfCandidates"]): ResolvedDoc {
  return {
    projectId: "p1",
    docJobId: "d1",
    openaireId: ID,
    doi: null,
    lane: "fulltext",
    meta: META,
    ...(candidates ? { pdfCandidates: candidates } : {}),
  };
}

async function seedReady(ds: MemoryDocState): Promise<void> {
  await ds.upsertDoc({ docJobId: "d1", projectId: "p1", openaireId: ID });
  await ds.recordPlan("d1", { lane: "fulltext", pagesExpected: 1, meta: META });
}

async function collect<T>(q: MemoryQueue, queue: string): Promise<T[]> {
  const out: T[] = [];
  await q.work<T>(queue, async (m) => void out.push(m.payload), { concurrency: 1 });
  return out;
}

test("median: even + odd + empty", () => {
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([3, 1, 2]), 2);
});

test("fetch-pdf: a valid PDF is stored and forwarded to extract", async () => {
  const q = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const ds = new MemoryDocState();
  await seedReady(ds);
  const fetcher = new FakePdfFetcher().add("https://ok/a.pdf", {
    ok: true,
    bytes: Buffer.from("%PDF-1.7 body"),
  });

  const toExtract = await collect<ResolvedDoc>(q, Q.extract);
  const stage = new FetchPdfStage(deps(q, blob), fetcher, ds);
  await stage.start();
  await q.send(Q.fetchPdf, resolved([{ url: "https://ok/a.pdf", host: "ok", license: null }]));
  await q.idle();

  assert.equal(toExtract.length, 1, "one doc forwarded to extract");
  const stored = await blob.getBytes(keys.pdf(ID));
  assert.ok(stored && stored.subarray(0, 5).toString() === "%PDF-");
});

test("fetch-pdf: all candidates fail → degrade to prepare (abstract lane), never drop", async () => {
  const q = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const ds = new MemoryDocState();
  await seedReady(ds);
  const fetcher = new FakePdfFetcher()
    .add("https://a/x.pdf", { ok: false, failure: "paywalled" })
    .add("https://b/y.pdf", { ok: false, failure: "not_found" });

  const toExtract = await collect<ResolvedDoc>(q, Q.extract);
  const toPrepare = await collect<ResolvedDoc>(q, Q.prepare);
  const stage = new FetchPdfStage(deps(q, blob), fetcher, ds);
  await stage.start();
  await q.send(
    Q.fetchPdf,
    resolved([
      { url: "https://a/x.pdf", host: "a", license: null },
      { url: "https://b/y.pdf", host: "b", license: null },
    ]),
  );
  await q.idle();

  assert.equal(toExtract.length, 0, "no PDF → nothing to extract");
  assert.equal(toPrepare.length, 1, "degraded doc sent to prepare");
  assert.equal(toPrepare[0]!.lane, "abstract", "degraded to the abstract lane (has abstract)");
  assert.equal(fetcher.requested.length, 2, "tried both candidates");
});

test("extract: text layer present → emits pageTexts to prepare (fulltext)", async () => {
  const q = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const ds = new MemoryDocState();
  await seedReady(ds);
  await blob.putBytes(keys.pdf(ID), Buffer.from("%PDF-..."));
  const extractor = new FakePdfExtractor({ pages: ["A".repeat(300), "B".repeat(300)] });

  const toPrepare = await collect<ResolvedDoc>(q, Q.prepare);
  const stage = new ExtractStage(deps(q, blob), extractor, ds);
  await stage.start();
  await q.send(Q.extract, resolved(undefined));
  await q.idle();

  assert.equal(toPrepare.length, 1);
  assert.equal(toPrepare[0]!.lane, "fulltext");
  assert.deepEqual(toPrepare[0]!.pageTexts?.length, 2);
});

test("extract: scanned (no text layer) → degrades to abstract lane", async () => {
  const q = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const ds = new MemoryDocState();
  await seedReady(ds);
  await blob.putBytes(keys.pdf(ID), Buffer.from("%PDF-..."));
  const extractor = new FakePdfExtractor({ pages: ["", "  ", "x"] }); // near-empty text layer

  const toPrepare = await collect<ResolvedDoc>(q, Q.prepare);
  const stage = new ExtractStage(deps(q, blob), extractor, ds);
  await stage.start();
  await q.send(Q.extract, resolved(undefined));
  await q.idle();

  assert.equal(toPrepare.length, 1);
  assert.equal(toPrepare[0]!.lane, "abstract");
  assert.equal(toPrepare[0]!.pageTexts, undefined, "no page texts on the degraded doc");
});

test("extract: a corrupt PDF (extractor throws) degrades, never drops", async () => {
  const q = new MemoryQueue();
  const blob = new MemoryBlobStore();
  const ds = new MemoryDocState();
  await seedReady(ds);
  await blob.putBytes(keys.pdf(ID), Buffer.from("%PDF-..."));
  const extractor = new FakePdfExtractor({ throwErr: true });

  const toPrepare = await collect<ResolvedDoc>(q, Q.prepare);
  const stage = new ExtractStage(deps(q, blob), extractor, ds);
  await stage.start();
  await q.send(Q.extract, resolved(undefined));
  await q.idle();

  assert.equal(toPrepare.length, 1, "corrupt PDF still reaches prepare via degrade");
  assert.equal(toPrepare[0]!.lane, "abstract");
});
