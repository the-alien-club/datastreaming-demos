/**
 * Publisher-direct JATS source (Tier 2) — for OA publishers that serve clean JATS
 * XML addressable straight from the DOI, covering docs that aren't in the PMC OA
 * subset. Two publishers are supported (they cover the corpus's OA long tail):
 *   - eLife: DOI 10.7554/eLife.<id>  → https://elifesciences.org/articles/<id>.xml
 *   - PLOS : DOI 10.1371/journal.<j>.<n> → journals.plos.org/<journal>/article/file
 *            ?id=<DOI>&type=manuscript
 * A non-matching DOI (or any non-2xx / non-JATS response) → null; the fetch-fulltext
 * stage falls through to the next tier. 429/503 → throw (retryable).
 */
import type { HostGate } from "../core/host-gate.js";
import type { JatsSource } from "../ports.js";

/** Thrown on a transient publisher failure so the stage's retry loop backs off. */
export class TransientPublisherError extends Error {}

/** PLOS journal DOI infix → the journals.plos.org path segment. */
const PLOS_JOURNALS: Record<string, string> = {
  pone: "plosone",
  pbio: "plosbiology",
  pgen: "plosgenetics",
  pcbi: "ploscompbiol",
  pntd: "plosntds",
  ppat: "plospathogens",
  pmed: "plosmedicine",
};

export interface PublisherJatsClientOptions {
  hostGate: HostGate;
  timeoutMs?: number;
  userAgent?: string;
}

export class PublisherJatsClient implements JatsSource {
  private readonly hostGate: HostGate;
  private readonly timeoutMs: number;
  private readonly ua: string;

  constructor(opts: PublisherJatsClientOptions) {
    this.hostGate = opts.hostGate;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.ua = opts.userAgent ?? "OpenAireCorpusBot/1.0";
  }

  async fetchByDoi(doi: string): Promise<string | null> {
    const target = this.urlFor(doi.trim().toLowerCase());
    if (!target) return null;
    return this.hostGate.run(target.host, () => this.fetchOnce(target.url));
  }

  /** Map a DOI to a publisher JATS url + host, or null when unsupported. */
  private urlFor(doi: string): { url: string; host: string } | null {
    const elife = /^10\.7554\/elife\.(\d+)/.exec(doi);
    if (elife) {
      return { url: `https://elifesciences.org/articles/${elife[1]}.xml`, host: "elifesciences.org" };
    }
    const plos = /^10\.1371\/journal\.([a-z]+)\./.exec(doi);
    if (plos) {
      const key = plos[1];
      const journal = key ? PLOS_JOURNALS[key] : undefined;
      if (!journal) return null;
      return {
        url: `https://journals.plos.org/${journal}/article/file?id=${encodeURIComponent(doi)}&type=manuscript`,
        host: "journals.plos.org",
      };
    }
    return null;
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
      throw new TransientPublisherError(`publisher fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = res.status;
    if (status === 404 || status === 410) return null;
    if (status === 429 || status === 503) {
      throw new TransientPublisherError(`publisher status ${status}`);
    }
    if (status < 200 || status >= 300) return null;

    const xml = await res.text();
    if (!xml.includes("<article") || !xml.includes("<body")) return null;
    return xml;
  }
}
