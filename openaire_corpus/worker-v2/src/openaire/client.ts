/**
 * OpenAIRE Graph API v2 client — resolves a research product by its OpenAIRE id.
 *
 * The worker trusts ONLY the `openaireId` the app sends and re-resolves everything
 * else itself here, hitting the PUBLIC Graph API directly (the app's hosted MCP is
 * a separate, proxied path). Endpoint + params/headers mirror the MCP's
 * `clients/openaire_client_v2.py`:
 *
 *   GET <base>/researchProducts/<id>?format=json      (Accept: application/json)
 *   404 → the product does not exist (permanent; skip the doc)
 *
 * The default base is the public API (`OPENAIRE_API_BASE`, no auth needed for
 * basic use); an optional bearer token (`OPENAIRE_API_TOKEN`) is attached when
 * present. A caller-supplied rate gate (60/min default, see core/rate.ts) paces
 * the calls; the gate lives in the resolve stage, not here, so this client stays a
 * pure transport (mirrors the BnfClient/FetchStage split).
 */
import { PermanentOpenAireError, TransientOpenAireError } from "./errors.js";
import type { OaProduct } from "./types.js";

export interface OpenAireClient {
  /** Resolve one product by bare OpenAIRE id (no `50|` prefix). */
  getById(openaireId: string): Promise<OaProduct>;
}

export interface LiveOpenAireClientOptions {
  /** Graph API base, no trailing slash. Default: the public API. */
  baseUrl?: string;
  /** Optional bearer token (personal token / registered app). */
  token?: string;
  /** Per-attempt hard timeout (ms). Default 30s. */
  timeoutMs?: number;
  /** Total attempts per call (incl. the first) for transient errors. Default 4. */
  attempts?: number;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE = "https://api.openaire.eu/graph/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPTS = 4;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class LiveOpenAireClient implements OpenAireClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: LiveOpenAireClientOptions = {}) {
    const base = (opts.baseUrl ?? process.env.OPENAIRE_API_BASE?.trim() ?? DEFAULT_BASE).replace(
      /\/+$/,
      "",
    );
    this.baseUrl = base;
    this.token = opts.token ?? process.env.OPENAIRE_API_TOKEN?.trim() ?? undefined;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async getById(openaireId: string): Promise<OaProduct> {
    const id = openaireId.trim();
    if (id.length === 0) {
      throw new PermanentOpenAireError("malformed_id", { id: openaireId });
    }
    const url = `${this.baseUrl}/researchProducts/${encodeURIComponent(id)}?format=json`;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await this.fetchOnce(url, id);
      } catch (e) {
        if (e instanceof PermanentOpenAireError) throw e; // never retry a permanent
        lastErr = e;
        if (attempt < this.attempts) {
          await sleep(500 * 2 ** (attempt - 1));
        }
      }
    }
    if (lastErr instanceof TransientOpenAireError) throw lastErr;
    throw new TransientOpenAireError("network", { id });
  }

  private async fetchOnce(url: string, id: string): Promise<OaProduct> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // Abort/timeout or a socket-level failure — transient, retry.
      const cause = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
      throw new TransientOpenAireError(cause, { id });
    }

    if (res.status === 404) throw new PermanentOpenAireError("not_found", { status: 404, id });
    if (res.status === 400) throw new PermanentOpenAireError("bad_request", { status: 400, id });
    if (res.status >= 500) throw new TransientOpenAireError("server_error", { status: res.status, id });
    if (res.status < 200 || res.status >= 300) {
      // Other 4xx (401/403/429…): treat 429 as transient, the rest as permanent.
      if (res.status === 429) {
        throw new TransientOpenAireError("server_error", { status: 429, id });
      }
      throw new PermanentOpenAireError("bad_request", { status: res.status, id });
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // A 2xx with a non-JSON/garbled body — transient (proxy hiccup), retry.
      throw new TransientOpenAireError("server_error", { status: res.status, id });
    }
    return normalizeProduct(body, id);
  }
}

/**
 * The Graph API returns the bare product object for the by-id endpoint. Some
 * deployments wrap it (`{ results: [product] }` or `{ response: { results } }`);
 * unwrap defensively so a shape change doesn't silently drop the doc.
 */
function normalizeProduct(body: unknown, id: string): OaProduct {
  if (body === null || typeof body !== "object") {
    throw new PermanentOpenAireError("not_found", { id });
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.id === "string" || typeof obj.mainTitle === "string") {
    return obj as OaProduct;
  }
  const results = extractResults(obj);
  const first = results?.[0];
  if (first && typeof first === "object") return first as OaProduct;
  throw new PermanentOpenAireError("not_found", { id });
}

function extractResults(obj: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(obj.results)) return obj.results;
  const response = obj.response;
  if (response && typeof response === "object" && Array.isArray((response as Record<string, unknown>).results)) {
    return (response as Record<string, unknown>).results as unknown[];
  }
  return null;
}
