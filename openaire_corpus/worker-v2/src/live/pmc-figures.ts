/**
 * PMC figure-image fetcher (M5). JATS carries figure captions + `<graphic
 * xlink:href>` filenames but NOT the image bytes; for the PMC OA subset the bytes
 * are served at
 *   https://pmc.ncbi.nlm.nih.gov/articles/{PMCID}/bin/{href}
 * A non-image / non-2xx response (paywalled, missing) → null; the caller skips that
 * figure (captions still make it into the section text). 429/503 → throw (retry).
 *
 * Host-gated for politeness. Only the PMC tier resolves figure images; publisher
 * JATS (eLife/PLOS) figure images use different URL schemes and are deferred — their
 * captions still ingest.
 */
import type { HostGate } from "../core/host-gate.js";
import type { FigureImageFetcher } from "../ports.js";

const PMC_HOST = "pmc.ncbi.nlm.nih.gov";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export class TransientPmcFigureError extends Error {}

export interface PmcFigureFetcherOptions {
  hostGate: HostGate;
  timeoutMs?: number;
  userAgent?: string;
  baseUrl?: string;
}

export class PmcFigureFetcher implements FigureImageFetcher {
  private readonly hostGate: HostGate;
  private readonly timeoutMs: number;
  private readonly ua: string;
  private readonly base: string;

  constructor(opts: PmcFigureFetcherOptions) {
    this.hostGate = opts.hostGate;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.ua = opts.userAgent ?? "OpenAireCorpusBot/1.0";
    this.base = opts.baseUrl ?? "https://pmc.ncbi.nlm.nih.gov/articles";
  }

  async fetch(input: {
    pmcid: string;
    href: string;
  }): Promise<{ bytes: Buffer; contentType: string } | null> {
    const pmcid = input.pmcid.trim();
    if (!/^PMC\d+$/i.test(pmcid)) return null;
    // The href may already carry an extension; PMC serves it under /bin/ verbatim.
    const file = input.href.trim().replace(/^\.?\//, "");
    if (!file) return null;
    const url = `${this.base}/${encodeURIComponent(pmcid)}/bin/${encodeURI(file)}`;
    return this.hostGate.run(PMC_HOST, () => this.fetchOnce(url));
  }

  private async fetchOnce(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": this.ua, accept: "image/*,*/*" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new TransientPmcFigureError(`pmc figure fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = res.status;
    if (status === 429 || status === 503) {
      throw new TransientPmcFigureError(`pmc figure status ${status}`);
    }
    if (status < 200 || status >= 300) return null;

    const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) return null; // an HTML landing page / error

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    // Normalise the content type to a bare "image/jpeg" | "image/png" | …
    const clean = contentType.split(";")[0]!.trim();
    return { bytes: buf, contentType: clean };
  }
}
