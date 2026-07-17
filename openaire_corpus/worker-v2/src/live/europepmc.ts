/**
 * Europe PMC full-text JATS source (Tier 1). Fetches
 *   GET https://www.ebi.ac.uk/europepmc/webservices/rest/{PMCID}/fullTextXML
 * which serves clean JATS XML for the PMC Open-Access subset (no auth). A 404 means
 * the article is PMC-indexed but NOT in the OA subset (no full text) → null, the
 * fetch-fulltext stage falls through to the next tier. 429/503 → throw (retryable).
 *
 * Politeness: Europe PMC caps at ~10 req/s per IP; we run every call through the
 * shared HostGate so bulk re-ingest never bursts. An honest UA + contact email are
 * sent per Europe PMC fair-use guidance.
 */
import type { HostGate } from "../core/host-gate.js";
import type { JatsSource } from "../ports.js";

const EPMC_HOST = "www.ebi.ac.uk";
const DEFAULT_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export interface EuropePmcClientOptions {
  hostGate: HostGate;
  /** Contact email sent as a UA suffix (Europe PMC fair-use). */
  email?: string;
  /** Per-attempt timeout (ms). Default 30s. */
  timeoutMs?: number;
  /** Override base URL (tests). */
  baseUrl?: string;
}

/** Thrown on a transient Europe PMC failure so the stage's retry loop backs off. */
export class TransientEuropePmcError extends Error {}

export class EuropePmcClient implements JatsSource {
  private readonly hostGate: HostGate;
  private readonly ua: string;
  private readonly timeoutMs: number;
  private readonly base: string;

  constructor(opts: EuropePmcClientOptions) {
    this.hostGate = opts.hostGate;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.base = opts.baseUrl ?? DEFAULT_BASE;
    this.ua = opts.email
      ? `OpenAireCorpusBot/1.0 (mailto:${opts.email})`
      : "OpenAireCorpusBot/1.0";
  }

  async fetchByPmcid(pmcid: string): Promise<string | null> {
    const id = pmcid.trim();
    if (!/^PMC\d+$/i.test(id)) return null;
    const url = `${this.base}/${encodeURIComponent(id)}/fullTextXML`;
    return this.hostGate.run(EPMC_HOST, () => this.fetchOnce(url));
  }

  private async fetchOnce(url: string): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": this.ua, accept: "application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new TransientEuropePmcError(`europepmc fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = res.status;
    if (status === 404 || status === 410) return null; // not in the OA subset → no full text here
    if (status === 429 || status === 503) {
      throw new TransientEuropePmcError(`europepmc status ${status}`);
    }
    if (status < 200 || status >= 300) {
      throw new TransientEuropePmcError(`europepmc status ${status}`);
    }

    const xml = await res.text();
    // A valid full-text response is a JATS <article>; anything else (an error page,
    // an empty stub) is treated as "no full text here".
    if (!xml.includes("<article") || !xml.includes("<body")) return null;
    return xml;
  }
}
