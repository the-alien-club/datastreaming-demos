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
import type { ScholexClient } from "./openaire/scholex.js";
import type { DocStateStore } from "./domain/doc-state.js";
import type {
  ClusterSink,
  Embedder,
  FigureImageFetcher,
  JatsSource,
  OaPdfLocator,
  PdfFetcher,
  PdfTextExtractor,
} from "./ports.js";

import { ResolveStage } from "./stages/resolve.js";
import { FetchFulltextStage } from "./stages/fetch-fulltext.js";
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
  /** Optional ScholeXplorer client — enriches resolved docs with citation-link
   *  counts. Omit to skip enrichment (counts stay null). */
  scholex?: ScholexClient;
  docState: DocStateStore;
  embedder: Embedder;
  cluster: ClusterSink;
  /** PDF/OCR full-text ports — required when fulltext (or JATS, for its fallback)
   *  is enabled. */
  pdfFetcher?: PdfFetcher;
  pdfExtractor?: PdfTextExtractor;
  /** JATS structured-text lane ports — supplied when jatsEnabled. */
  jats?: {
    europePmc?: JatsSource;
    publisherJats?: JatsSource;
    unpaywall?: OaPdfLocator;
    figureImages?: FigureImageFetcher;
  };
  /** Optional per-dispatch observability hook (also feeds the read-model). */
  onOutcome?: StageDeps["onOutcome"];
  /** Per-stage rate gates (undefined → unthrottled, e.g. in tests). */
  rates?: {
    resolve?: RateGate;
    embed?: RateGate;
  };
  config?: {
    fulltextEnabled?: boolean;
    jatsEnabled?: boolean;
    resolveConcurrency?: number;
    fetchFulltextConcurrency?: number;
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
    new ResolveStage(
      base,
      deps.openaire,
      deps.docState,
      rates.resolve,
      {
        ...(cfg.fulltextEnabled !== undefined ? { fulltextEnabled: cfg.fulltextEnabled } : {}),
        ...(cfg.jatsEnabled !== undefined ? { jatsEnabled: cfg.jatsEnabled } : {}),
        ...(cfg.resolveConcurrency !== undefined ? { concurrency: cfg.resolveConcurrency } : {}),
      },
      deps.scholex,
    ),
    new PrepareStage(base, deps.docState),
    new EmbedStage(base, deps.embedder, deps.docState, rates.embed, {
      ...(cfg.embedConcurrency !== undefined ? { concurrency: cfg.embedConcurrency } : {}),
    }),
    new RegisterStage(base, deps.cluster, deps.docState, {
      ...(cfg.registerConcurrency !== undefined ? { concurrency: cfg.registerConcurrency } : {}),
    }),
  ];

  // The PDF+OCR lane is needed when fulltext is enabled OR when JATS is enabled (the
  // JATS lane falls back to PDF+OCR on a miss). Enabling either without the ports is a
  // wiring error (fail loud at composition).
  if (cfg.fulltextEnabled || cfg.jatsEnabled) {
    if (!deps.pdfFetcher || !deps.pdfExtractor) {
      throw new Error("buildPipeline: fulltext/JATS requires pdfFetcher + pdfExtractor");
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

  // The JATS structured-text lane (Tier 1/2/4 cascade). Requires at least one JATS
  // source; the PDF lane above is its fallback.
  if (cfg.jatsEnabled) {
    const jats = deps.jats ?? {};
    if (!jats.europePmc && !jats.publisherJats) {
      throw new Error("buildPipeline: jatsEnabled requires at least one JATS source");
    }
    stages.push(
      new FetchFulltextStage(
        base,
        {
          ...(jats.europePmc ? { europePmc: jats.europePmc } : {}),
          ...(jats.publisherJats ? { publisherJats: jats.publisherJats } : {}),
          ...(jats.unpaywall ? { unpaywall: jats.unpaywall } : {}),
          ...(jats.figureImages ? { figureImages: jats.figureImages } : {}),
        },
        deps.docState,
        {
          ...(cfg.fetchFulltextConcurrency !== undefined
            ? { concurrency: cfg.fetchFulltextConcurrency }
            : {}),
        },
      ),
    );
  }

  return new Pipeline(queue, stages, log);
}
