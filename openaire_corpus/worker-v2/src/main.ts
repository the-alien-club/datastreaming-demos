/**
 * Worker V2 entrypoint — the production composition. Wires the durable transport
 * (pg-boss), the per-doc state (Postgres), the artifact store (S3), the live
 * OpenAIRE Graph API client + the two downstream live ports (embedder + cluster
 * sink), and the resolve rate gate, then starts the pipeline. Long-running: every
 * stage long-polls its bucket forever; the process stays up until SIGINT/SIGTERM.
 *
 * This file does I/O only — all behaviour lives in the stages + buildPipeline,
 * which the fake-mode integration test exercises with the exact same wiring.
 */
import { Pool } from "pg";

import { loadConfig } from "./config.js";
import { buildPipeline } from "./build.js";
import { PgBossQueue } from "./core/queue-pgboss.js";
import { S3BlobStore } from "./core/blob.js";
import { RateLimiter } from "./core/rate.js";
import { createLogger } from "./core/logger.js";
import { PgDocState } from "./domain/doc-state-pg.js";
import { PgRunStore } from "./domain/run-store-pg.js";
import { HostGate } from "./core/host-gate.js";
import { LiveOpenAireClient } from "./openaire/client.js";
import { LiveScholexClient, NullScholexClient } from "./openaire/scholex.js";
import { LiveEmbedder } from "./live/embedder.js";
import { LiveClusterSink } from "./live/cluster.js";
import { LivePdfFetcher } from "./live/pdf-fetcher.js";
import { MistralOcrExtractor } from "./live/mistral-ocr.js";
import { EuropePmcClient } from "./live/europepmc.js";
import { PublisherJatsClient } from "./live/publisher-jats.js";
import { UnpaywallClient } from "./live/unpaywall.js";
import { PmcFigureFetcher } from "./live/pmc-figures.js";
import { TerminalEmitter } from "./live/progress-callback.js";
import { CompletionMonitor } from "./live/completion-monitor.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger({ worker: "openaire-ingest-v2" });

  const queue = new PgBossQueue(cfg.databaseUrl);
  await queue.start();

  const pool = new Pool({ connectionString: cfg.databaseUrl });
  const docState = new PgDocState(pool);
  await docState.migrate();
  const runStore = new PgRunStore(pool);

  const blob = new S3BlobStore({ ...cfg.s3, prefix: cfg.s3Prefix });

  const resolveRate = new RateLimiter({ ratePerMin: cfg.openaireRpm });

  // ScholeXplorer citation-link enrichment — rate-gated, best-effort. Disabled
  // via SCHOLEX_ENABLED=false (then counts stay null).
  const scholex = cfg.scholexEnabled
    ? new LiveScholexClient({ rate: new RateLimiter({ ratePerMin: cfg.scholexRpm }) })
    : new NullScholexClient();

  // Full-text lane clients — built when fulltext OR JATS is enabled (JATS falls back
  // to PDF+OCR, so it needs the PDF lane too). They own their own net I/O.
  const anyFulltext = cfg.fulltextEnabled || cfg.jatsEnabled;
  const hostGate = anyFulltext ? new HostGate({ ratePerMin: cfg.pdfHostRpm }) : null;
  const pdfFetcher = hostGate
    ? new LivePdfFetcher({ hostGate, maxBytes: cfg.pdfMaxBytes })
    : undefined;
  // Full-text extraction via Mistral OCR (built when a full-text lane is on — it
  // reads MISTRAL_API_KEY lazily, so abstract-only runs never need the key).
  const pdfExtractor = anyFulltext ? new MistralOcrExtractor() : undefined;

  // JATS structured-text lane clients (Europe PMC + publisher + Unpaywall + PMC
  // figure images). Built only when jatsEnabled; the Unpaywall tier additionally
  // needs a contact email (its API mandates one).
  // NB: figure IMAGES are intentionally NOT wired for v1. The PMC `/bin/{href}`
  // pattern 404s on modern PMC (images live on an unpredictable CDN / in the OA
  // package tar.gz), so wiring PmcFigureFetcher would only make one wasted 404 per
  // figure per doc. Figure CAPTIONS are already ingested inline in the section text
  // (searchable) and this stays graceful (0 figure files). Proper figure-image
  // fetching via the PMC OA package is a tracked follow-up. PmcFigureFetcher is kept
  // (tested) for that work.
  void PmcFigureFetcher;
  const jats = cfg.jatsEnabled && hostGate
    ? {
        europePmc: new EuropePmcClient({
          hostGate,
          ...(cfg.contactEmail ? { email: cfg.contactEmail } : {}),
        }),
        publisherJats: new PublisherJatsClient({ hostGate }),
        ...(cfg.unpaywallEnabled && cfg.contactEmail
          ? { unpaywall: new UnpaywallClient({ hostGate, email: cfg.contactEmail }) }
          : {}),
      }
    : undefined;
  if (cfg.jatsEnabled && cfg.unpaywallEnabled && !cfg.contactEmail) {
    log.warn("unpaywall_disabled_no_email", {
      msg: "UNPAYWALL_ENABLED=true but CONTACT_EMAIL is unset; Unpaywall tier is off",
    });
  }

  // The terminal commit callback + the run-completion detector. The detector is
  // wired to the pipeline's onOutcome seam (below), so a doc reaching a terminal
  // status triggers a run-completeness check → one HMAC-signed terminal event.
  const emitter = new TerminalEmitter(docState, runStore, log);
  const completion = new CompletionMonitor(docState, runStore, emitter, log);

  const pipeline = buildPipeline({
    queue,
    blob,
    log,
    openaire: new LiveOpenAireClient({
      ...(cfg.openaireApiBase !== undefined ? { baseUrl: cfg.openaireApiBase } : {}),
      ...(cfg.openaireApiToken !== undefined ? { token: cfg.openaireApiToken } : {}),
    }),
    scholex,
    docState,
    embedder: new LiveEmbedder(),
    cluster: new LiveClusterSink(),
    ...(pdfFetcher ? { pdfFetcher } : {}),
    ...(pdfExtractor ? { pdfExtractor } : {}),
    ...(jats ? { jats } : {}),
    onOutcome: (e) => completion.noteOutcome({ kind: e.kind, payload: e.payload }),
    rates: { resolve: resolveRate },
    config: {
      fulltextEnabled: cfg.fulltextEnabled,
      jatsEnabled: cfg.jatsEnabled,
      resolveConcurrency: cfg.resolveConcurrency,
      fetchFulltextConcurrency: cfg.fetchFulltextConcurrency,
      fetchPdfConcurrency: cfg.fetchPdfConcurrency,
      extractConcurrency: cfg.extractConcurrency,
      extractMaxPages: cfg.pdfMaxPages,
      embedConcurrency: cfg.embedConcurrency,
      registerConcurrency: cfg.registerConcurrency,
    },
  });

  await pipeline.start();

  // The app↔worker HTTP ingress: POST /ingest (open a run + seed) + GET
  // /progress/:runId (the Ingérer poll read-model) + cancel + health.
  const server = await startServer(
    {
      runStore,
      docState,
      queue,
      completion,
      log,
      fetchRatePerMin: cfg.processRatePerMin,
      manifestRatePerMin: 42,
    },
    cfg.httpPort,
  );

  log.info("worker_v2_up", {
    httpPort: cfg.httpPort,
    openaireRpm: cfg.openaireRpm,
    fulltextEnabled: cfg.fulltextEnabled,
    jatsEnabled: cfg.jatsEnabled,
    unpaywallEnabled: cfg.unpaywallEnabled && !!cfg.contactEmail,
  });

  let shuttingDown = false;
  const shutdown = async (sig: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker_v2_shutdown", { sig });
    resolveRate.stop();
    hostGate?.stop();
    pdfFetcher?.stop();
    await new Promise<void>((r) => server.close(() => r()));
    await pipeline.stop().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker-v2] fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
