/**
 * Live PdfTextExtractor — pdfjs-dist (legacy build, no worker thread). Loads the
 * PDF from bytes and pulls each page's text content in order. Capped at `maxPages`.
 *
 * The legacy build is used because the default build assumes a browser worker; the
 * legacy build runs in plain Node with the worker disabled (isEvalSupported off,
 * standard font data path left unset — we only need the text layer, not rendering).
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { PdfTextExtractor } from "../ports.js";

/** A text-run item from getTextContent — only `str` is load-bearing here. Marked-
 *  content items (structure markers) have no `str` and are filtered out. */
interface TextRun {
  str: string;
}

function isTextRun(item: unknown): item is TextRun {
  return typeof (item as { str?: unknown }).str === "string";
}

export class LivePdfExtractor implements PdfTextExtractor {
  async extract(
    bytes: Buffer,
    opts: { maxPages: number },
  ): Promise<{ pages: string[]; figures: [] }> {
    // pdfjs wants a Uint8Array it can transfer; copy so we don't detach the caller's Buffer.
    const data = new Uint8Array(bytes);
    const doc = await getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    try {
      const pageCount = Math.min(doc.numPages, opts.maxPages);
      const pages: string[] = [];
      for (let n = 1; n <= pageCount; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const text = (content.items as unknown[])
          .filter(isTextRun)
          .map((it) => it.str)
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .trim();
        pages.push(text);
        page.cleanup();
      }
      // pdfjs text-layer extraction yields no figure crops (Mistral OCR does).
      return { pages, figures: [] };
    } finally {
      await doc.destroy();
    }
  }
}
