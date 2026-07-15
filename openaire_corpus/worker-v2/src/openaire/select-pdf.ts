/**
 * PURE candidate-PDF selection from an OpenAIRE product's `instances[]`.
 *
 * Only OPEN, non-embargoed instances are considered. Each instance's `urls[]` are
 * scored and the whole set is ranked (best first). Preference order:
 *   1. direct PDF endpoints we know serve the raw file (arXiv /pdf/, PMC pdf,
 *      Europe PMC fullTextPDF), 2. any `.pdf`-suffixed url, 3. repository/OA hosts,
 *      4. a CC-licensed publisher, 5. everything else.
 *
 * No I/O — the fetchPdf stage (B-M2) downloads + validates the actual bytes; this
 * only decides the try-order. Exported for focused unit tests (select-pdf.test.ts).
 */
import type { PdfCandidate } from "../domain/types.js";
import type { OaInstance, OaProduct } from "./types.js";

/** Access-right labels that count as fetchable. Anything else (CLOSED, RESTRICTED,
 *  UNKNOWN) is skipped — we never try to download behind a paywall. */
const OPEN_LABELS = new Set(["OPEN", "OPEN SOURCE"]);

function isOpen(inst: OaInstance): boolean {
  const label = inst.accessRight?.label?.toUpperCase().trim();
  return label !== undefined && OPEN_LABELS.has(label);
}

/** True if the instance is under an active embargo (a future embargo end date). */
export function isEmbargoed(inst: OaInstance): boolean {
  const label = inst.accessRight?.label?.toUpperCase().trim();
  return label === "EMBARGO";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isCcLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  const l = license.toLowerCase();
  return l.includes("creativecommons") || /\bcc[ -]?by\b/.test(l) || l.includes("cc0");
}

/** Higher score = tried sooner. Pure function of the url + instance context. */
function scoreUrl(url: string, inst: OaInstance): number {
  const u = url.toLowerCase();
  const host = hostOf(url);
  let score = 0;

  // Known direct-PDF endpoints.
  if (host.includes("arxiv.org") && u.includes("/pdf/")) score += 100;
  if (host.includes("ncbi.nlm.nih.gov") && u.includes("pdf")) score += 90;
  if (host.includes("europepmc.org") && u.includes("fulltextpdf")) score += 90;

  // Any explicit .pdf suffix (before a query string).
  if (/\.pdf(\?|#|$)/.test(u)) score += 60;

  // Repository / preprint / OA hosts.
  if (
    host.includes("arxiv.org") ||
    host.includes("biorxiv.org") ||
    host.includes("medrxiv.org") ||
    host.includes("ncbi.nlm.nih.gov") ||
    host.includes("europepmc.org") ||
    host.includes("zenodo.org") ||
    host.includes("hal.") ||
    host.includes("repository") ||
    host.includes("repositorio")
  ) {
    score += 30;
  }

  // A CC-licensed publisher instance is safe to fetch.
  if (isCcLicense(inst.license)) score += 15;

  // Prefer https.
  if (u.startsWith("https://")) score += 2;

  return score;
}

/**
 * Rank the candidate PDF urls across all OPEN, non-embargoed instances (best
 * first). De-duplicates by url; drops obvious non-http urls. Returns [] when the
 * product has no fetchable full text.
 */
export function selectPdfCandidates(product: OaProduct): PdfCandidate[] {
  const scored: Array<{ cand: PdfCandidate; score: number }> = [];
  const seen = new Set<string>();

  for (const inst of product.instances ?? []) {
    if (!inst || !isOpen(inst) || isEmbargoed(inst)) continue;
    for (const url of inst.urls ?? []) {
      if (typeof url !== "string") continue;
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);
      scored.push({
        cand: { url: trimmed, host: hostOf(trimmed), license: inst.license ?? null },
        score: scoreUrl(trimmed, inst),
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.cand);
}
