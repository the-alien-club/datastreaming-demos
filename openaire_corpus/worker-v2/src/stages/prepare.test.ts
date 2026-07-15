/**
 * Pure tests for the prepare stage's chunk builders (abstract/metadata + page
 * chunking, merge-tiny/split-large) and the resolve stage's lane decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMetaChunks, buildPageChunks, renderMetadataText } from "./prepare.js";
import { decideLane } from "./resolve.js";
import type { OaMeta } from "../domain/types.js";

const baseMeta: OaMeta = {
  title: "Title",
  abstract: null,
  authors: ["A. Author"],
  year: 2020,
  venue: "Venue",
  publisher: "Pub",
  type: "publication",
  doi: "10.1/x",
  bestAccessRight: "OPEN",
  openAccessColor: "gold",
  subjects: ["s1"],
};

test("buildMetaChunks: abstract present → one abstract-locator chunk of title+abstract", () => {
  const chunks = buildMetaChunks({ ...baseMeta, abstract: "The abstract." });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.locator.kind, "abstract");
  assert.equal(chunks[0]!.text, "Title\n\nThe abstract.");
});

test("buildMetaChunks: no abstract → one metadata-locator formatted record", () => {
  const chunks = buildMetaChunks(baseMeta);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.locator.kind, "metadata");
  assert.ok(chunks[0]!.text.includes("Title"));
  assert.ok(chunks[0]!.text.includes("A. Author"));
});

test("renderMetadataText includes the salient fields", () => {
  const txt = renderMetadataText(baseMeta);
  assert.ok(txt.includes("Year: 2020"));
  assert.ok(txt.includes("Venue: Venue"));
  assert.ok(txt.includes("Subjects: s1"));
});

test("buildPageChunks: lead abstract chunk then one chunk per page", () => {
  const chunks = buildPageChunks(
    { ...baseMeta, abstract: "Abs." },
    ["Page one is long enough to stand alone.".padEnd(300, "x"), "Page two also long.".padEnd(300, "y")],
  );
  assert.equal(chunks[0]!.locator.kind, "abstract");
  assert.equal(chunks[1]!.locator.kind, "page");
  assert.equal(chunks.length, 3);
});

test("buildPageChunks: a tiny page merges forward into the next", () => {
  const chunks = buildPageChunks(baseMeta, ["short", "the rest of the content here".padEnd(300, "z")]);
  // lead + one merged page chunk (the tiny page 1 merged into page 2's chunk).
  const pageChunks = chunks.filter((c) => c.locator.kind === "page");
  assert.equal(pageChunks.length, 1);
  assert.ok(pageChunks[0]!.text.startsWith("short"));
});

test("buildPageChunks: a huge page splits into parts", () => {
  const huge = "para.\n\n".repeat(2000); // well over 4000 chars, paragraph-separated
  const chunks = buildPageChunks(baseMeta, [huge]);
  const parts = chunks.filter((c) => c.locator.kind === "page");
  assert.ok(parts.length >= 2, "large page split into >=2 parts");
  for (const c of parts) {
    assert.ok(c.text.length <= 4000);
    assert.equal(c.locator.kind === "page" && c.locator.part !== undefined, true);
  }
});

test("decideLane: fulltext only when enabled + candidates; else abstract/metadata", () => {
  const withAbs: OaMeta = { ...baseMeta, abstract: "x" };
  const cand = [{ url: "https://x/a.pdf", host: "x", license: null }];
  assert.equal(decideLane(withAbs, cand, true), "fulltext");
  assert.equal(decideLane(withAbs, cand, false), "abstract");
  assert.equal(decideLane(withAbs, [], true), "abstract");
  assert.equal(decideLane(baseMeta, [], true), "metadata");
});
