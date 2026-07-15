/**
 * Pure-logic tests for the live ClusterSink helpers + the dataset slug.
 *
 * Citation-critical: every indexed chunk must carry openaire_id + its section/page
 * locator, and the embedding must align with its chunk by position.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { openaireDatasetSlug } from "./vendor/dataset.js";
import type { OaMeta, PreparedChunk } from "../domain/types.js";
import { buildIndexChunks } from "./cluster.js";

const meta: OaMeta = {
  title: "A Study of Fakes",
  abstract: "An abstract.",
  authors: ["Ada Lovelace"],
  year: 2020,
  venue: "Journal of Fakes",
  publisher: "ACME",
  type: "publication",
  doi: "10.1234/fake",
  bestAccessRight: "OPEN",
  openAccessColor: "gold",
  subjects: ["computing"],
};

const chunks: PreparedChunk[] = [
  { index: 0, text: "A Study of Fakes\n\nAn abstract.", locator: { kind: "abstract" } },
  { index: 1, text: "Body of page 3", locator: { kind: "page", page: 3 } },
];

test("openaireDatasetSlug derives openaire-<projectId>", () => {
  assert.equal(openaireDatasetSlug("abc123"), "openaire-abc123");
});

test("buildIndexChunks aligns embeddings by position and carries id + section/page", () => {
  const embeddings = [
    [0.1, 0.2],
    [0.3, 0.4],
  ];
  const indexed = buildIndexChunks("doi_dedup::abc", meta, chunks, embeddings);
  assert.equal(indexed.length, 2);

  assert.equal(indexed[0]!.chunk_text, "A Study of Fakes\n\nAn abstract.");
  assert.equal(indexed[0]!.chunk_index, 0);
  assert.deepEqual(indexed[0]!.embedding, [0.1, 0.2]);
  assert.equal(indexed[0]!.metadata.openaire_id, "doi_dedup::abc");
  assert.equal(indexed[0]!.metadata.doi, "10.1234/fake");
  assert.equal(indexed[0]!.metadata.section, "abstract");
  assert.equal(indexed[0]!.metadata.page, null);
  assert.equal(indexed[0]!.metadata.year, 2020);

  // Second chunk → second embedding → page 3, fulltext section.
  assert.deepEqual(indexed[1]!.embedding, [0.3, 0.4]);
  assert.equal(indexed[1]!.metadata.section, "fulltext");
  assert.equal(indexed[1]!.metadata.page, 3);
});
