/**
 * Pure tests for the prepare stage's chunk builders (abstract/metadata + page
 * chunking, merge-tiny/split-large) and the resolve stage's lane decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMetaChunks, buildPageChunks, buildSectionChunks, renderMetadataText } from "./prepare.js";
import { decideLane } from "./resolve.js";
import type { DocSection, OaMeta } from "../domain/types.js";

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

test("buildSectionChunks: abstract lead chunk + one chunk per section, section locators", () => {
  const sections: DocSection[] = [
    { id: "results", title: "Results", text: "We found HGT signatures." },
    { id: "methods", title: "Methods", text: "Bayesian inference." },
  ];
  const chunks = buildSectionChunks({ ...baseMeta, abstract: "An abstract." }, sections);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]!.locator.kind, "abstract");
  assert.equal(chunks[0]!.text, "Title\n\nAn abstract.");
  assert.equal(chunks[1]!.locator.kind, "section");
  assert.deepEqual(
    chunks.slice(1).map((c) => (c.locator.kind === "section" ? c.locator.id : null)),
    ["results", "methods"],
  );
});

test("buildSectionChunks: a >4000-char section splits into parts carrying id/title", () => {
  const big = "word ".repeat(1200); // ~6000 chars
  const chunks = buildSectionChunks(baseMeta, [{ id: "results", title: "Results", text: big }]);
  const parts = chunks.filter((c) => c.locator.kind === "section");
  assert.ok(parts.length >= 2, "large section split into >=2 parts");
  for (const c of parts) {
    assert.ok(c.text.length <= 4000);
    assert.equal(c.locator.kind === "section" && c.locator.id === "results", true);
    assert.equal(c.locator.kind === "section" && c.locator.part !== undefined, true);
  }
});

test("buildSectionChunks: empty sections are skipped (no wasted chunk)", () => {
  const chunks = buildSectionChunks(baseMeta, [
    { id: "results", title: "Results", text: "   " },
    { id: "methods", title: "Methods", text: "Real text." },
  ]);
  // lead (title only, no abstract) + one real section
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1]!.locator.kind === "section" && chunks[1]!.locator.id, "methods");
});

test("decideLane: PDF fulltext only when enabled + candidates; else abstract/metadata", () => {
  const withAbs: OaMeta = { ...baseMeta, abstract: "x" };
  const noDoi: OaMeta = { ...baseMeta, doi: null };
  const noDoiAbs: OaMeta = { ...noDoi, abstract: "x" };
  const cand = [{ url: "https://x/a.pdf", host: "x", license: null }];
  const pdfOnly = { fulltextEnabled: true, jatsEnabled: false };
  const off = { fulltextEnabled: false, jatsEnabled: false };
  assert.equal(decideLane(withAbs, cand, pdfOnly), "fulltext");
  assert.equal(decideLane(withAbs, cand, off), "abstract");
  // No DOI ⇒ not JATS-eligible; no candidates ⇒ not PDF-eligible → abstract/metadata.
  assert.equal(decideLane(noDoiAbs, [], pdfOnly), "abstract");
  assert.equal(decideLane(noDoi, [], pdfOnly), "metadata");
});

test("decideLane: JATS-eligible on a pmc id or DOI even with no PDF candidates", () => {
  const jatsOn = { fulltextEnabled: false, jatsEnabled: true };
  // DOI present → JATS lane.
  assert.equal(decideLane(baseMeta, [], jatsOn), "fulltext");
  // pmc id present, no DOI → still JATS lane.
  assert.equal(decideLane({ ...baseMeta, doi: null, pmcid: "PMC1" }, [], jatsOn), "fulltext");
  // Neither pmc nor DOI, no candidates → abstract/metadata even with JATS on.
  const bare: OaMeta = { ...baseMeta, doi: null, abstract: "x" };
  assert.equal(decideLane(bare, [], jatsOn), "abstract");
});
