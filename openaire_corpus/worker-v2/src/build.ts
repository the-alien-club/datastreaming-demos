/**
 * Composition root — wires the pipeline stages given the transport, blob store,
 * logger, the OpenAIRE client, the two downstream ports (embedder + cluster sink),
 * the doc-state store, and the resolve rate gate. Both the real worker entrypoint
 * and the integration tests build the pipeline through here, so the topology lives
 * in ONE place and tests exercise the exact wiring that ships.
 *
 * Topology: resolve → [fulltext: fetchPdf → extract] → prepare → embed → register.
 * When `fulltextEnabled` is off, resolve routes every doc straight to prepare and
 * the fetchPdf/extract stages simply never receive work (they still run their
 * empty worker loops, which is harmless).
 */
import { Pipeline, type RunnableStage } from "./core/pipeline.js";
import type { BlobStore, Logger, QueueClient, RateGate } from "./core/types.js";
import type { StageDeps } from "./core/stage.js";
import type { OpenAireClient } from "./openaire/client.js";
import type { DocStateStore } from "./domain/doc-state.js";
import type { ClusterSink, Embedder, PdfFetcher, PdfTextExtractor } from "./ports.js";

import { ResolveStage } from "./stages/resolve.js";
import { FetchPdfStage } from "./stages/fetch-pdf.js";
import { ExtractStage } from "./stages/extract.js";
import { PrepareStage } from "./stages/prepare.js";
import { EmbedStage } from "./stages/embed.js";
import { RegisterStage } from "./stages/register.js";

export interface PipelineDeps {
  queue: QueueClient;
  blob: BlobStore;
  log: Logger;
  openaire: OpenAireClient;
  docState: DocStateStore;
  embedder: Embedder;
  cluster: ClusterSink;
  /** Full-text ports — required only when fulltext is enabled. */
  pdfFetcher?: PdfFetcher;
  pdfExtractor?: PdfTextExtractor;
  /** Optional per-dispatch observability hook (also feeds the read-model). */
  onOutcome?: StageDeps["onOutcome"];
  /** Per-stage rate gates (undefined → unthrottled, e.g. in tests). */
  rates?: {
    resolve?: RateGate;
    embed?: RateGate;
  };
  config?: {
    fulltextEnabled?: boolean;
    resolveConcurrency?: number;
    fetchPdfConcurrency?: number;
    extractConcurrency?: number;
    extractMaxPages?: number;
    prepareConcurrency?: number;
    embedConcurrency?: number;
    registerConcurrency?: number;
  };
}

export function buildPipeline(deps: PipelineDeps): Pipeline {
  const { queue, blob, log, onOutcome } = deps;
  const base: StageDeps = { queue, blob, log, ...(onOutcome ? { onOutcome } : {}) };
  const cfg = deps.config ?? {};
  const rates = deps.rates ?? {};

  const stages: RunnableStage[] = [
    new ResolveStage(base, deps.openaire, deps.docState, rates.resolve, {
      ...(cfg.fulltextEnabled !== undefined ? { fulltextEnabled: cfg.fulltextEnabled } : {}),
      ...(cfg.resolveConcurrency !== undefined ? { concurrency: cfg.resolveConcurrency } : {}),
    }),
    new PrepareStage(base, deps.docState),
    new EmbedStage(base, deps.embedder, deps.docState, rates.embed, {
      ...(cfg.embedConcurrency !== undefined ? { concurrency: cfg.embedConcurrency } : {}),
    }),
    new RegisterStage(base, deps.cluster, deps.docState, {
      ...(cfg.registerConcurrency !== undefined ? { concurrency: cfg.registerConcurrency } : {}),
    }),
  ];

  // The fulltext lane stages are added only when their ports are supplied. Enabling
  // fulltext without them is a wiring error (fail loud at composition).
  if (cfg.fulltextEnabled) {
    if (!deps.pdfFetcher || !deps.pdfExtractor) {
      throw new Error("buildPipeline: fulltextEnabled requires pdfFetcher + pdfExtractor");
    }
    stages.push(
      new FetchPdfStage(base, deps.pdfFetcher, deps.docState, {
        ...(cfg.fetchPdfConcurrency !== undefined ? { concurrency: cfg.fetchPdfConcurrency } : {}),
      }),
      new ExtractStage(base, deps.pdfExtractor, deps.docState, {
        ...(cfg.extractConcurrency !== undefined ? { concurrency: cfg.extractConcurrency } : {}),
        ...(cfg.extractMaxPages !== undefined ? { maxPages: cfg.extractMaxPages } : {}),
      }),
    );
  }

  return new Pipeline(queue, stages, log);
}
