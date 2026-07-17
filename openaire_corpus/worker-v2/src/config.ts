/**
 * Infra config for the worker-v2 entrypoint — DB, S3, and the per-stage rate/
 * concurrency knobs. Required vars THROW at startup if missing (no empty defaults —
 * platform CLAUDE_ERROR_PATTERNS §10). The downstream live clients (embed/cluster)
 * read their OWN secrets from env, so they are not duplicated here.
 */
function required(name: string): string {
  const v = process.env[name];
  if (v == null || v.trim() === "") throw new Error(`Missing required env var ${name}`);
  return v.trim();
}
function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${v}`);
  return Math.floor(n);
}
function optionalBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  if (v !== "true" && v !== "false") throw new Error(`${name} must be "true"|"false", got ${v}`);
  return v === "true";
}

export interface WorkerConfig {
  databaseUrl: string;
  /** Port the app↔worker HTTP ingress listens on (the app's WORKER_RUNNER_URL). */
  httpPort: number;
  s3: { bucket: string; endpoint: string; region: string; accessKeyId: string; secretAccessKey: string };
  /** S3 key prefix isolating V2 artifacts (shared bucket). */
  s3Prefix: string;
  /** OpenAIRE Graph API base + optional token. */
  openaireApiBase: string | undefined;
  openaireApiToken: string | undefined;
  /** OpenAIRE resolve rate (products/min) — the ungated public-API politeness cap. */
  openaireRpm: number;
  /** Enrich resolved docs with ScholeXplorer citation-link counts. */
  scholexEnabled: boolean;
  /** ScholeXplorer call rate (requests/min) — politeness cap for the /v3/Links API. */
  scholexRpm: number;
  /** Route OPEN docs with a candidate PDF through the PDF+OCR fulltext lane (B-M2). */
  fulltextEnabled: boolean;
  /** Prefer clean JATS full text (Europe PMC → publisher → Unpaywall) over PDF+OCR. */
  jatsEnabled: boolean;
  /** Enable the Unpaywall OA-PDF fallback tier (needs unpaywallEmail). */
  unpaywallEnabled: boolean;
  /** Contact email for Unpaywall (required by their API) + Europe PMC UA. */
  contactEmail: string | undefined;
  /** FetchFulltext stage concurrency. */
  fetchFulltextConcurrency: number;
  /** Per-host PDF-fetch politeness rate (requests/min/host). */
  pdfHostRpm: number;
  /** Max PDF bytes to download before rejecting `too_large`. */
  pdfMaxBytes: number;
  /** Max PDF pages to extract. */
  pdfMaxPages: number;
  /** Processing rate (docs/min) used for the read-model ETA. */
  processRatePerMin: number;
  /** Doc-resolution concurrency (bounded downstream by openaireRpm). */
  resolveConcurrency: number;
  /** PDF-fetch stage concurrency. */
  fetchPdfConcurrency: number;
  /** Extract stage concurrency. */
  extractConcurrency: number;
  /** Prepare stage concurrency. */
  prepareConcurrency: number;
  /** Embed (RunPod) concurrency. */
  embedConcurrency: number;
  /** Data-cluster register (indexing) concurrency. */
  registerConcurrency: number;
}

export function loadConfig(): WorkerConfig {
  return {
    databaseUrl: required("DATABASE_URL"),
    httpPort: optionalInt("WORKER_HTTP_PORT", 7777),
    s3: {
      bucket: required("SCW_S3_BUCKET"),
      endpoint: required("SCW_S3_ENDPOINT_URL"),
      region: required("SCW_S3_REGION"),
      accessKeyId: required("SCW_S3_ACCESS_KEY"),
      secretAccessKey: required("SCW_S3_SECRET_KEY"),
    },
    s3Prefix: process.env.V2_S3_PREFIX?.trim() || "v2/",
    openaireApiBase: process.env.OPENAIRE_API_BASE?.trim() || undefined,
    openaireApiToken: process.env.OPENAIRE_API_TOKEN?.trim() || undefined,
    openaireRpm: optionalInt("OPENAIRE_RPM", 60),
    scholexEnabled: optionalBool("SCHOLEX_ENABLED", true),
    scholexRpm: optionalInt("SCHOLEX_RPM", 60),
    fulltextEnabled: optionalBool("FULLTEXT_ENABLED", false),
    jatsEnabled: optionalBool("JATS_ENABLED", false),
    unpaywallEnabled: optionalBool("UNPAYWALL_ENABLED", false),
    contactEmail: process.env.CONTACT_EMAIL?.trim() || undefined,
    fetchFulltextConcurrency: optionalInt("FETCH_FULLTEXT_CONCURRENCY", 6),
    pdfHostRpm: optionalInt("PDF_HOST_RPM", 60),
    pdfMaxBytes: optionalInt("PDF_MAX_BYTES", 50 * 1024 * 1024),
    pdfMaxPages: optionalInt("PDF_MAX_PAGES", 500),
    processRatePerMin: optionalInt("PROCESS_RPM", 300),
    resolveConcurrency: optionalInt("RESOLVE_CONCURRENCY", 6),
    fetchPdfConcurrency: optionalInt("FETCH_PDF_CONCURRENCY", 8),
    extractConcurrency: optionalInt("EXTRACT_CONCURRENCY", 4),
    prepareConcurrency: optionalInt("PREPARE_CONCURRENCY", 8),
    embedConcurrency: optionalInt("EMBED_CONCURRENCY", 8),
    registerConcurrency: optionalInt("REGISTER_CONCURRENCY", 24),
  };
}
