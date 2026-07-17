/**
 * Unpaywall OA-PDF locator (Tier 4). Given a DOI, returns a direct OA PDF url when
 * Unpaywall knows one (`best_oa_location.url_for_pdf`, else the first oa_location
 * with a pdf url). This is a DISCOVERY layer — it returns a url, not content; the
 * fetch-fulltext stage hands the url to the existing PDF+OCR lane. Used only after
 * the JATS tiers miss, so it catches green/hybrid OA not in PMC.
 *
 * The `email` query param is REQUIRED by Unpaywall (identifies the caller); the
 * client throws at construction if it's absent. 100k calls/day per email.
 */
import type { HostGate } from "../core/host-gate.js";
import type { OaPdfLocator } from "../ports.js";

const UNPAYWALL_HOST = "api.unpaywall.org";

export class TransientUnpaywallError extends Error {}

interface OaLocation {
  url_for_pdf?: string | null;
  url?: string | null;
}
interface UnpaywallResponse {
  is_oa?: boolean;
  best_oa_location?: OaLocation | null;
  oa_locations?: OaLocation[] | null;
}

export interface UnpaywallClientOptions {
  hostGate: HostGate;
  /** Contact email — REQUIRED by the Unpaywall API. */
  email: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export class UnpaywallClient implements OaPdfLocator {
  private readonly hostGate: HostGate;
  private readonly email: string;
  private readonly timeoutMs: number;
  private readonly base: string;

  constructor(opts: UnpaywallClientOptions) {
    if (!opts.email || !opts.email.trim()) {
      throw new Error("UnpaywallClient requires an email (Unpaywall API mandates it)");
    }
    this.hostGate = opts.hostGate;
    this.email = opts.email.trim();
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.base = opts.baseUrl ?? "https://api.unpaywall.org/v2";
  }

  async findPdfUrl(doi: string): Promise<string | null> {
    const id = doi.trim().toLowerCase();
    if (!id.startsWith("10.")) return null;
    const url = `${this.base}/${encodeURIComponent(id)}?email=${encodeURIComponent(this.email)}`;
    return this.hostGate.run(UNPAYWALL_HOST, () => this.fetchOnce(url));
  }

  private async fetchOnce(url: string): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "OpenAireCorpusBot/1.0", accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new TransientUnpaywallError(`unpaywall fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = res.status;
    if (status === 404) return null; // DOI unknown to Unpaywall
    if (status === 429 || status === 503) {
      throw new TransientUnpaywallError(`unpaywall status ${status}`);
    }
    if (status < 200 || status >= 300) return null;

    let data: UnpaywallResponse;
    try {
      data = (await res.json()) as UnpaywallResponse;
    } catch {
      return null;
    }
    if (!data.is_oa) return null;
    const best = data.best_oa_location?.url_for_pdf;
    if (typeof best === "string" && best.length > 0) return best;
    for (const loc of data.oa_locations ?? []) {
      if (typeof loc.url_for_pdf === "string" && loc.url_for_pdf.length > 0) return loc.url_for_pdf;
    }
    return null;
  }
}
