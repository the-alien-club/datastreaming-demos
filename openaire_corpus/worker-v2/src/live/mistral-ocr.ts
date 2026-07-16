/**
 * Mistral OCR — whole-PDF transcription for the full-text lane (B-M2).
 *
 * One synchronous `POST /v1/ocr` call per PDF: the document is sent as a base64
 * `data:application/pdf;base64,…` URL and Mistral returns per-page markdown (it
 * OCRs scanned PDFs and born-digital alike, so there is no separate "scanned"
 * path) plus the page's figure image crops (`include_image_base64: true`).
 *
 * We extract the figures as real image files (assigned stable ids f1..fN in
 * reading order) so they can be stored on the data-cluster entry and pulled into
 * research notes, and we rewrite each inline `![alt](img-k.jpeg)` reference to a
 * stable `![caption](figure:fN)` form. The caption prose stays in the page
 * markdown either way, so full-text/caption search is unaffected.
 *
 * Direct `fetch` (no SDK) to match the worker's self-contained HTTP clients. The
 * call is bounded by an AbortSignal timeout (CLAUDE_ERROR_PATTERNS §14 — no
 * unbounded external awaits); a failure throws so the extract stage retries and,
 * on exhaustion, degrades the doc to the abstract lane (never drops it).
 */
import type { ExtractedFigure, PdfTextExtractor } from "../ports.js";

const OCR_URL = "https://api.mistral.ai/v1/ocr";
const DEFAULT_MODEL = "mistral-ocr-latest";
/** Wall-clock ceiling for one OCR call. A long paper can take ~1 min server-side. */
const DEFAULT_TIMEOUT_MS = 180_000;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v.trim() === "") throw new Error(`Missing required env var ${name}`);
  return v.trim();
}

/**
 * Detect a hallucinated OCR page — on blank/near-blank input the model fabricates
 * content instead of returning empty: it repeats one filler line many times and/or
 * injects boilerplate. Per-page confidence does not flag these, so we key on the
 * structural tells. Ported from the BnF worker (verified live there). A flagged
 * page is dropped (→ empty string) so fabricated text never reaches the RAG store,
 * while keeping page alignment intact for citation locators.
 */
const HALLUCINATION_FILLER_RE =
  /cannot be extracted|simple (?:diagram|formula)|ground truth|underscore.{0,24}rule/i;

export function looksLikeHallucinatedOcr(markdown: string): boolean {
  const lines = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 12);
  if (lines.length === 0) return false;
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  if (Math.max(...counts.values()) >= 4) return true;
  return lines.filter((l) => HALLUCINATION_FILLER_RE.test(l)).length >= 2;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Decode a Mistral image_base64 (a `data:image/…;base64,…` URL, or bare base64)
 *  → bytes + MIME. Returns null on anything unparseable. */
export function decodeImageData(raw: string | undefined): { bytes: Buffer; contentType: string } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(raw.trim());
  const b64 = m ? m[2]! : raw.trim();
  const contentType = m ? m[1]!.toLowerCase() : "image/jpeg";
  try {
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/** Rewrite an inline `![alt](imgId)` markdown reference to `![caption](figure:fId)`.
 *  When `fId` is null (the image couldn't be decoded), drop the reference entirely. */
export function rewriteImageRef(
  markdown: string,
  imgId: string,
  fId: string | null,
  caption: string,
): string {
  const re = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escapeRegExp(imgId)}\\s*\\)`, "g");
  if (fId === null) return markdown.replace(re, "");
  const alt = caption.replace(/[\r\n]+/g, " ").slice(0, 200);
  return markdown.replace(re, `![${alt}](figure:${fId})`);
}

interface OcrResponseImage {
  id?: string;
  image_base64?: string;
  image_annotation?: unknown;
}
interface OcrResponsePage {
  index?: number;
  markdown?: string;
  images?: OcrResponseImage[];
}
interface OcrResponse {
  pages?: OcrResponsePage[];
}

export interface MistralOcrClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class MistralOcrClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MistralOcrClientOptions = {}) {
    // Secret read here (lazy at construction, only built when fulltext is on) so
    // abstract-only runs never need MISTRAL_API_KEY — no defaulted secret.
    this.apiKey = opts.apiKey ?? requiredEnv("MISTRAL_API_KEY");
    this.model = opts.model ?? process.env.MISTRAL_OCR_MODEL?.trim() ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /**
   * OCR a whole PDF → per-page markdown (page-aligned: index 0 = PDF page 1) plus
   * the figure image crops. Hallucinated pages become "" (page number preserved
   * for the chunker's locators) and contribute no figures. Capped at `maxPages`.
   */
  async ocrPdf(
    bytes: Buffer,
    opts: { maxPages: number },
  ): Promise<{ pages: string[]; figures: ExtractedFigure[] }> {
    const dataUrl = `data:application/pdf;base64,${bytes.toString("base64")}`;
    const res = await this.fetchFn(OCR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        document: { type: "document_url", document_url: dataUrl },
        include_image_base64: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Mistral OCR HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as OcrResponse;
    const ordered = (json.pages ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .slice(0, opts.maxPages);

    const figures: ExtractedFigure[] = [];
    let fno = 0;
    const pages = ordered.map((p, i) => {
      let md = typeof p.markdown === "string" ? p.markdown : "";
      if (looksLikeHallucinatedOcr(md)) return "";
      const page = (typeof p.index === "number" ? p.index : i) + 1;
      for (const im of p.images ?? []) {
        const imgId = typeof im.id === "string" ? im.id : "";
        if (!imgId) continue;
        const decoded = decodeImageData(im.image_base64);
        if (!decoded) {
          md = rewriteImageRef(md, imgId, null, ""); // undecodable → drop the ref
          continue;
        }
        fno += 1;
        const id = `f${fno}`;
        const caption =
          typeof im.image_annotation === "string" && im.image_annotation.trim().length > 0
            ? im.image_annotation.trim()
            : "";
        figures.push({ id, page, bytes: decoded.bytes, contentType: decoded.contentType, caption });
        md = rewriteImageRef(md, imgId, id, caption);
      }
      return md.trim();
    });
    return { pages, figures };
  }
}

/** PdfTextExtractor backed by Mistral OCR — the full-text lane's extractor. */
export class MistralOcrExtractor implements PdfTextExtractor {
  private readonly client: MistralOcrClient;
  constructor(client: MistralOcrClient = new MistralOcrClient()) {
    this.client = client;
  }
  extract(
    bytes: Buffer,
    opts: { maxPages: number },
  ): Promise<{ pages: string[]; figures: ExtractedFigure[] }> {
    return this.client.ocrPdf(bytes, opts);
  }
}
