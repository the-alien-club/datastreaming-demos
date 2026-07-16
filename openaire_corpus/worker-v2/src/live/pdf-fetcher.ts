/**
 * Live PdfFetcher — downloads a candidate PDF politely and validates it is really a
 * PDF (content-type lies, so we check the `%PDF-` magic bytes). Per-host politeness
 * comes from the shared HostGate (1 concurrent + ~1 rps per host); an honest UA is
 * sent; Retry-After is honoured on 429/503; a hard timeout + a size cap bound the
 * download.
 *
 * Failure taxonomy (mapped to the port's PdfFetchFailure):
 *   401/402/403        → paywalled
 *   404/410            → not_found
 *   text/html body     → html_not_pdf
 *   over the size cap  → too_large
 *   abort/timeout      → timeout
 *   not %PDF- bytes    → bad_pdf
 */
import { Agent, interceptors, request, type Dispatcher } from "undici";

import type { HostGate } from "../core/host-gate.js";
import type { PdfFetchResult, PdfFetcher } from "../ports.js";

const PDF_MAGIC = Buffer.from("%PDF-");
const DEFAULT_UA = "OpenAireCorpusBot/1.0";

export interface LivePdfFetcherOptions {
  hostGate: HostGate;
  /** Max bytes before rejecting `too_large`. Default 50 MB. */
  maxBytes?: number;
  /** Per-attempt hard timeout (ms). Default 60s. */
  timeoutMs?: number;
  /** Total attempts (incl. first) for transient failures. Default 3. */
  attempts?: number;
  userAgent?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class LivePdfFetcher implements PdfFetcher {
  private readonly hostGate: HostGate;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly ua: string;
  private readonly agent: Agent;
  private readonly dispatcher: Dispatcher;

  constructor(opts: LivePdfFetcherOptions) {
    this.hostGate = opts.hostGate;
    this.maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.attempts = Math.max(1, opts.attempts ?? 3);
    this.ua = opts.userAgent ?? DEFAULT_UA;
    // Follow redirects (repositories bounce to a CDN/file url) up to a cap.
    this.agent = new Agent({ connect: { timeout: 10_000 }, pipelining: 0 });
    this.dispatcher = this.agent.compose(interceptors.redirect({ maxRedirections: 5 }));
  }

  async fetch(input: { url: string; host: string }): Promise<PdfFetchResult> {
    let last: PdfFetchResult = { ok: false, failure: "not_found" };
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      const res = await this.hostGate.run(input.host, () => this.fetchOnce(input.url));
      if (res.ok) return res;
      last = res;
      // Only timeouts are worth retrying; paywalled/not_found/bad_pdf are permanent.
      if (res.failure !== "timeout") return res;
      if (attempt < this.attempts) await sleep(1000 * 2 ** (attempt - 1));
    }
    return last;
  }

  private async fetchOnce(url: string): Promise<PdfFetchResult> {
    let res: Awaited<ReturnType<typeof request>>;
    try {
      res = await request(url, {
        method: "GET",
        headers: { "user-agent": this.ua, accept: "application/pdf,*/*" },
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return { ok: false, failure: "timeout" };
    }

    // Absorb any async body 'error' (e.g. UND_ERR_ABORTED when the timeout signal
    // aborts mid-stream). Without a listener Node treats it as fatal; the for-await
    // / discardBody paths still surface the failure themselves.
    res.body.on("error", () => {});

    const status = res.statusCode;
    if (status === 401 || status === 402 || status === 403) {
      discardBody(res.body);
      return { ok: false, failure: "paywalled", detail: `status ${status}` };
    }
    if (status === 404 || status === 410) {
      discardBody(res.body);
      return { ok: false, failure: "not_found", detail: `status ${status}` };
    }
    if (status === 429 || status === 503) {
      discardBody(res.body);
      // Treat as timeout so the caller's retry loop backs off + retries.
      return { ok: false, failure: "timeout", detail: `status ${status}` };
    }
    if (status < 200 || status >= 300) {
      discardBody(res.body);
      return { ok: false, failure: "not_found", detail: `status ${status}` };
    }

    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (contentType.includes("text/html")) {
      discardBody(res.body);
      return { ok: false, failure: "html_not_pdf", detail: contentType };
    }

    // Stream with a size cap.
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buf.length;
        if (size > this.maxBytes) {
          discardBody(res.body);
          return { ok: false, failure: "too_large", detail: `> ${this.maxBytes} bytes` };
        }
        chunks.push(buf);
      }
    } catch {
      return { ok: false, failure: "timeout", detail: "stream error" };
    }

    const bytes = Buffer.concat(chunks);
    if (bytes.length < 5 || !bytes.subarray(0, 5).equals(PDF_MAGIC)) {
      // Content-type lied (or an HTML error page slipped through) — not a real PDF.
      return { ok: false, failure: "bad_pdf", detail: "missing %PDF- magic" };
    }
    return { ok: true, bytes };
  }

  stop(): void {
    void this.agent.close();
  }
}

/**
 * Discard a response body without crashing the process. An aborted/reset undici
 * body emits its `UND_ERR_ABORTED` on the stream's ASYNC 'error' event — a plain
 * try/catch around `destroy()` cannot catch it, and with no listener Node treats
 * it as a fatal uncaught error (observed live: the worker exited on a timed-out
 * PDF fetch). Attaching a no-op 'error' listener before destroying absorbs it.
 * Fire-and-forget: callers are already returning a failure result.
 */
function discardBody(body: { on(ev: "error", cb: () => void): unknown; destroy: () => void }): void {
  try {
    body.on("error", () => {});
    body.destroy();
  } catch {
    // best-effort
  }
}
