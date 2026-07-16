/**
 * ScholeXplorer client — citation / relationship link counts for a DOI.
 *
 * Spec: src/openaire/spec/scholexplorer_api.json, `GET /v3/Links`
 * (base https://api.scholexplorer.openaire.eu). The endpoint returns a
 * PageResultType whose `totalLinks` is the count we want; we never page the
 * bodies. Two cheap calls give the two headline magnitudes:
 *   - targetPid=<doi> → totalLinks = links pointing AT this product (cited-by)
 *   - sourcePid=<doi> → totalLinks = links FROM this product (references)
 *
 * Enrichment only: a failure (or a DOI-less product) yields nulls and NEVER
 * fails the doc — relation counts are a nice-to-have on the datacluster entry,
 * not a gate. Rate-gated + injectable fetch for tests, mirroring the Graph client.
 */
import type { RateLimiter } from "../core/rate.js";

const DEFAULT_BASE = "https://api.scholexplorer.openaire.eu";

export interface ScholexRelationCounts {
  /** Links pointing at this product (approx. cited-by). Null when unknown. */
  citedBy: number | null;
  /** Links from this product (approx. references). Null when unknown. */
  references: number | null;
}

export interface ScholexClient {
  relationCounts(doi: string): Promise<ScholexRelationCounts>;
}

export interface LiveScholexClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  rate?: RateLimiter;
  timeoutMs?: number;
}

interface PageResultType {
  totalLinks?: number;
}

export class LiveScholexClient implements ScholexClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly rate: RateLimiter | undefined;
  private readonly timeoutMs: number;

  constructor(opts: LiveScholexClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SCHOLEXPLORER_API_BASE?.trim() ?? DEFAULT_BASE).replace(
      /\/+$/,
      "",
    );
    this.fetchFn = opts.fetchFn ?? fetch;
    this.rate = opts.rate;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  async relationCounts(doi: string): Promise<ScholexRelationCounts> {
    const bare = doi.trim();
    if (bare === "") return { citedBy: null, references: null };
    const [citedBy, references] = await Promise.all([
      this.total({ targetPid: bare }),
      this.total({ sourcePid: bare }),
    ]);
    return { citedBy, references };
  }

  /** One /v3/Links call, returning `totalLinks` (or null on any failure). */
  private async total(params: Record<string, string>): Promise<number | null> {
    if (this.rate) await this.rate.acquire();
    const qs = new URLSearchParams({ ...params, page: "0", size: "1" });
    const url = `${this.baseUrl}/v3/Links?${qs.toString()}`;
    try {
      const res = await this.fetchFn(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as PageResultType;
      return typeof body.totalLinks === "number" ? body.totalLinks : null;
    } catch {
      // Enrichment only — swallow and report "unknown".
      return null;
    }
  }
}

/** No-op client for tests / when ScholeXplorer is disabled. */
export class NullScholexClient implements ScholexClient {
  async relationCounts(): Promise<ScholexRelationCounts> {
    return { citedBy: null, references: null };
  }
}
