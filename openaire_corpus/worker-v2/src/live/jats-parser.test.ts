/** Pure tests for the JATS parser — body sections, nested sec folding, figure
 *  extraction (id + href + caption), and graceful failure on non-JATS input. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseJats } from "./jats-parser.js";

const SAMPLE = `<?xml version="1.0"?>
<article article-type="research-article">
  <front><article-meta><abstract><p>Ignored abstract.</p></abstract></article-meta></front>
  <body>
    <sec id="s1"><title>Introduction</title>
      <p>Oskar is a <italic>de novo</italic> gene<xref ref-type="bibr" rid="b1">1</xref>.</p>
    </sec>
    <sec id="results"><title>Results</title>
      <p>We found HGT signatures.</p>
      <fig id="fig1"><label>Figure 1</label>
        <caption><p>Phylogenetic tree of Oskar.</p></caption>
        <graphic xlink:href="elife-45539-fig1.jpg"/>
      </fig>
      <sec><title>Sub-result</title><p>A nested finding.</p></sec>
    </sec>
    <sec><title>Materials and methods</title><p>We used Bayesian inference.</p></sec>
  </body>
</article>`;

test("parseJats: one section per top-level <sec>, titles + text", () => {
  const { sections } = parseJats(SAMPLE);
  assert.equal(sections.length, 3);
  assert.deepEqual(
    sections.map((s) => s.id),
    ["s1", "results", "materials-and-methods"],
  );
  assert.equal(sections[0]!.title, "Introduction");
  assert.ok(sections[0]!.text.includes("de novo gene"));
});

test("parseJats: nested <sec> text + title folded into the parent section", () => {
  const { sections } = parseJats(SAMPLE);
  const results = sections.find((s) => s.id === "results")!;
  assert.ok(results.text.includes("Sub-result"), "nested title kept")
  assert.ok(results.text.includes("A nested finding."), "nested body kept")
});

test("parseJats: figure caption inlined for search + figure recorded with href", () => {
  const { sections, figures } = parseJats(SAMPLE);
  const results = sections.find((s) => s.id === "results")!;
  assert.ok(results.text.includes("Phylogenetic tree of Oskar."), "caption inlined in section text")
  assert.equal(figures.length, 1);
  assert.equal(figures[0]!.id, "f1");
  assert.equal(figures[0]!.href, "elife-45539-fig1.jpg");
  assert.ok(figures[0]!.caption.includes("Phylogenetic tree"));
});

test("parseJats: non-JATS / body-less input → empty (caller degrades)", () => {
  assert.deepEqual(parseJats("<html><body>not jats</body></html>").sections, []);
  assert.deepEqual(parseJats("garbage").sections, []);
  assert.deepEqual(parseJats("<article><front/></article>").sections, []);
});

test("parseJats: loose <p> with no <sec> → single 'Full text' section", () => {
  const xml = `<article><body><p>Just prose, no sections.</p></body></article>`;
  const { sections } = parseJats(xml);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.id, "body");
  assert.ok(sections[0]!.text.includes("Just prose"));
});
