/**
 * Unit tests for the Mistral OCR client's figure extraction + markdown rewrite.
 * No network — the client takes an injected `fetchFn`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MistralOcrClient,
  decodeImageData,
  rewriteImageRef,
  looksLikeHallucinatedOcr,
} from "./mistral-ocr.js";

// A 1x1 png as a data URL (smallest valid PNG).
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("decodeImageData parses a data URL → bytes + mime", () => {
  const d = decodeImageData(PNG_1PX);
  assert.ok(d);
  assert.equal(d.contentType, "image/png");
  assert.ok(d.bytes.length > 0);
  // PNG magic
  assert.deepEqual([...d.bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test("decodeImageData: bare base64 defaults to image/jpeg; junk → null", () => {
  const d = decodeImageData("aGVsbG8=");
  assert.equal(d?.contentType, "image/jpeg");
  assert.equal(decodeImageData(""), null);
  assert.equal(decodeImageData(undefined), null);
});

test("rewriteImageRef swaps ![alt](imgId) → ![caption](figure:fId), or drops when null", () => {
  const md = "text\n\n![img-0.jpeg](img-0.jpeg)\n\nmore";
  assert.match(rewriteImageRef(md, "img-0.jpeg", "f1", "Figure 1: a plot"), /!\[Figure 1: a plot\]\(figure:f1\)/);
  assert.doesNotMatch(rewriteImageRef(md, "img-0.jpeg", null, ""), /img-0\.jpeg/);
});

test("ocrPdf extracts figures (stable f-ids), rewrites refs, page-aligns", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        pages: [
          { index: 0, markdown: "Intro, no figure.", images: [] },
          {
            index: 1,
            markdown: "See ![img-0.jpeg](img-0.jpeg) and ![img-1.jpeg](img-1.jpeg).",
            images: [
              { id: "img-0.jpeg", image_base64: PNG_1PX, image_annotation: "Panel A" },
              { id: "img-1.jpeg", image_base64: PNG_1PX },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;

  const client = new MistralOcrClient({ apiKey: "test", fetchFn: fakeFetch });
  const { pages, figures } = await client.ocrPdf(Buffer.from("%PDF-fake"), { maxPages: 100 });

  assert.equal(pages.length, 2);
  assert.equal(figures.length, 2);
  assert.deepEqual(
    figures.map((f) => [f.id, f.page, f.caption]),
    [
      ["f1", 2, "Panel A"],
      ["f2", 2, ""],
    ],
  );
  // page markdown references were rewritten to the stable figure ids
  assert.match(pages[1]!, /figure:f1/);
  assert.match(pages[1]!, /figure:f2/);
  assert.doesNotMatch(pages[1]!, /img-0\.jpeg/);
});

test("looksLikeHallucinatedOcr flags repeated filler", () => {
  const junk = Array(6).fill("cannot be extracted from this simple diagram").join("\n");
  assert.equal(looksLikeHallucinatedOcr(junk), true);
  assert.equal(looksLikeHallucinatedOcr("A normal paragraph of real text."), false);
});
