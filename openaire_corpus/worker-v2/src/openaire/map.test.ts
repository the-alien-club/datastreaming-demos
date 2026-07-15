/**
 * Pure tests for the OpenAIRE → OaMeta mapper: DOI extraction/normalisation, year
 * parse, author ordering, subject flattening, abstract selection, fallbacks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractDoi, parseYear, toMeta } from "./map.js";
import type { OaProduct } from "./types.js";

test("extractDoi pulls the doi pid, normalised (no url/prefix, lower-case)", () => {
  assert.equal(
    extractDoi({ pids: [{ scheme: "doi", value: "https://doi.org/10.1234/ABC" }] }),
    "10.1234/abc",
  );
  assert.equal(extractDoi({ pids: [{ scheme: "pmid", value: "999" }] }), null);
  assert.equal(extractDoi({}), null);
});

test("parseYear takes the leading YYYY", () => {
  assert.equal(parseYear("2019-05-01"), 2019);
  assert.equal(parseYear("2019"), 2019);
  assert.equal(parseYear(null), null);
  assert.equal(parseYear("not a date"), null);
});

test("toMeta normalises the full record, sorts authors by rank, flattens subjects", () => {
  const product: OaProduct = {
    id: "oa::1",
    mainTitle: "  A Title  ",
    descriptions: ["", "First real abstract.", "second"],
    type: "publication",
    authors: [
      { fullName: "Second", rank: 2 },
      { fullName: "First", rank: 1 },
      { name: "NoRank" },
    ],
    publicationDate: "2021-03-01",
    publisher: "ACME",
    container: { name: "J. Fakes" },
    pids: [{ scheme: "doi", value: "10.5/x" }],
    bestAccessRight: { label: "OPEN" },
    openAccessColor: "gold",
    subjects: [{ subject: { value: "ml" } }, { subject: { value: "" } }],
  };
  const meta = toMeta(product, null);
  assert.equal(meta.title, "A Title");
  assert.equal(meta.abstract, "First real abstract.");
  assert.deepEqual(meta.authors, ["First", "Second", "NoRank"]);
  assert.equal(meta.year, 2021);
  assert.equal(meta.venue, "J. Fakes");
  assert.equal(meta.doi, "10.5/x");
  assert.equal(meta.bestAccessRight, "OPEN");
  assert.equal(meta.openAccessColor, "gold");
  assert.deepEqual(meta.subjects, ["ml"]);
});

test("toMeta falls back: no title → Untitled, no doi pid → the app's doi, no abstract → null", () => {
  const meta = toMeta({ type: "dataset" }, "10.9/fallback");
  assert.equal(meta.title, "Untitled");
  assert.equal(meta.abstract, null);
  assert.equal(meta.doi, "10.9/fallback");
  assert.equal(meta.type, "dataset");
  assert.deepEqual(meta.authors, []);
});
