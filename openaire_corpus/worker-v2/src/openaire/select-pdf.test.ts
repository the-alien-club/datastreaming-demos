/**
 * Pure tests for candidate-PDF selection: OPEN-only, embargo skip, ranking (direct
 * PDF endpoints > .pdf suffix > repository host), and de-duplication.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectPdfCandidates, isEmbargoed } from "./select-pdf.js";
import type { OaProduct } from "./types.js";

test("only OPEN, non-embargoed instances contribute candidates", () => {
  const product: OaProduct = {
    instances: [
      { accessRight: { label: "CLOSED" }, urls: ["https://closed/x.pdf"] },
      { accessRight: { label: "EMBARGO" }, urls: ["https://embargo/x.pdf"] },
      { accessRight: { label: "OPEN" }, urls: ["https://open/x.pdf"] },
    ],
  };
  const cands = selectPdfCandidates(product);
  assert.equal(cands.length, 1);
  assert.equal(cands[0]!.url, "https://open/x.pdf");
});

test("ranks direct PDF endpoints above generic repository urls, dedups", () => {
  const product: OaProduct = {
    instances: [
      {
        accessRight: { label: "OPEN" },
        urls: [
          "https://example.org/record/1",
          "https://arxiv.org/pdf/2101.00001",
          "https://arxiv.org/pdf/2101.00001", // duplicate
          "https://example.org/file.pdf",
        ],
      },
    ],
  };
  const cands = selectPdfCandidates(product);
  assert.equal(cands[0]!.url, "https://arxiv.org/pdf/2101.00001", "arXiv /pdf/ ranked first");
  assert.equal(cands[1]!.url, "https://example.org/file.pdf", ".pdf suffix ranked next");
  // de-duplicated + the bare record url last.
  assert.equal(cands.length, 3);
  assert.equal(cands[2]!.url, "https://example.org/record/1");
});

test("no instances / no OPEN url → empty", () => {
  assert.deepEqual(selectPdfCandidates({}), []);
  assert.deepEqual(selectPdfCandidates({ instances: [{ accessRight: { label: "OPEN" }, urls: [] }] }), []);
});

test("isEmbargoed flags an EMBARGO instance", () => {
  assert.equal(isEmbargoed({ accessRight: { label: "EMBARGO" } }), true);
  assert.equal(isEmbargoed({ accessRight: { label: "OPEN" } }), false);
});
