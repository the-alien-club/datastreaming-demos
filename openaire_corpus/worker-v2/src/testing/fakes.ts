/**
 * In-memory fakes for the OpenAIRE client + the two downstream ports, with explicit
 * fault injection (transient 5xx that recover after N attempts, permanent 404).
 * These let the whole pipeline run end to end — every lane, plus retry/failure/
 * observability — with zero network. The live clients implement the same interfaces.
 */
import { PermanentOpenAireError, TransientOpenAireError } from "../openaire/errors.js";
import type { OpenAireClient } from "../openaire/client.js";
import type { OaProduct } from "../openaire/types.js";
import type {
  ClusterSink,
  Embedder,
  PdfFetchResult,
  PdfFetcher,
  PdfTextExtractor,
} from "../ports.js";
import type { PreparedChunk } from "../domain/types.js";

/** A scripted fault: throw a transient for the first `transientTimes` calls, then
 *  succeed; or `permanent:true` to throw a PermanentOpenAireError every time; or
 *  `alwaysTransient:true` to never recover (→ exhaust retries). */
export interface Fault {
  status?: number;
  transientTimes?: number;
  permanent?: boolean;
  alwaysTransient?: boolean;
}

export interface FakeProductSpec {
  openaireId: string;
  /** The product returned on success. Omit fields to test normalisation. */
  product?: Partial<OaProduct>;
  /** Fault on getById. */
  fault?: Fault;
}

export class FakeOpenAireClient implements OpenAireClient {
  private readonly specs = new Map<string, FakeProductSpec>();
  private readonly seen = new Map<string, number>();
  readonly calls = { getById: 0 };

  add(spec: FakeProductSpec): this {
    this.specs.set(spec.openaireId, spec);
    return this;
  }

  async getById(openaireId: string): Promise<OaProduct> {
    this.calls.getById++;
    const spec = this.specs.get(openaireId);
    if (!spec) throw new PermanentOpenAireError("not_found", { status: 404, id: openaireId });

    const fault = spec.fault;
    if (fault) {
      if (fault.permanent) {
        throw new PermanentOpenAireError("not_found", { status: fault.status ?? 404, id: openaireId });
      }
      const n = (this.seen.get(openaireId) ?? 0) + 1;
      this.seen.set(openaireId, n);
      if (fault.alwaysTransient || (fault.transientTimes && n <= fault.transientTimes)) {
        throw new TransientOpenAireError("server_error", { status: fault.status ?? 500, id: openaireId });
      }
    }

    return {
      id: openaireId,
      mainTitle: `Title of ${openaireId}`,
      descriptions: ["An abstract."],
      type: "publication",
      authors: [{ fullName: "Ada Lovelace", rank: 1 }],
      publicationDate: "2020-01-01",
      publisher: "ACME",
      container: { name: "Journal of Fakes" },
      language: { code: "en" },
      pids: [{ scheme: "doi", value: "10.1234/fake" }],
      bestAccessRight: { label: "OPEN" },
      openAccessColor: "gold",
      subjects: [{ subject: { value: "computing" } }],
      instances: [],
      ...spec.product,
    };
  }
}

export class FakeEmbedder implements Embedder {
  readonly dim = 4;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => [t.length, 1, 2, 3]);
  }
}

/** A PDF fetcher scripted per-url: a valid PDF buffer, or a specific failure. */
export class FakePdfFetcher implements PdfFetcher {
  readonly requested: string[] = [];
  private readonly results = new Map<string, PdfFetchResult>();

  add(url: string, result: PdfFetchResult): this {
    this.results.set(url, result);
    return this;
  }

  async fetch(input: { url: string; host: string }): Promise<PdfFetchResult> {
    this.requested.push(input.url);
    return this.results.get(input.url) ?? { ok: false, failure: "not_found" };
  }
}

/** Returns a fixed set of page texts (or throws to simulate a corrupt PDF). */
export class FakePdfExtractor implements PdfTextExtractor {
  constructor(private readonly opts: { pages?: string[]; throwErr?: boolean } = {}) {}
  async extract(_bytes: Buffer, opts: { maxPages: number }): Promise<{ pages: string[] }> {
    if (this.opts.throwErr) throw new Error("corrupt pdf");
    return { pages: (this.opts.pages ?? []).slice(0, opts.maxPages) };
  }
}

export class FakeClusterSink implements ClusterSink {
  readonly upserts: Array<{ openaireId: string; chunks: number; lane: string }> = [];
  private nextEntry = 1;
  async ensureDataset(): Promise<{ datasetId: number }> {
    return { datasetId: 1 };
  }
  async upsert(input: {
    openaireId: string;
    chunks: PreparedChunk[];
    lane: string;
  }): Promise<{ entryId: number }> {
    this.upserts.push({ openaireId: input.openaireId, chunks: input.chunks.length, lane: input.lane });
    return { entryId: this.nextEntry++ };
  }
}
