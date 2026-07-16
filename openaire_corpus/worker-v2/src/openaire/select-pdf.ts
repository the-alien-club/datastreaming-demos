/**
 * PURE candidate-PDF selection from an OpenAIRE product's `instances[]`.
 *
 * Instances of an open-access product (gated by product `bestAccessRight` /
 * openAccessColor, since the API leaves per-instance access null) contribute
 * candidates; explicitly CLOSED/embargoed instances are skipped. Each `urls[]` are
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

/** Per-instance access labels that count as openly fetchable. */
const OPEN_LABELS = new Set(["OPEN", "OPEN SOURCE"]);
/** Per-instance access labels we never try to download (explicit paywall). */
const CLOSED_LABELS = new Set(["CLOSED", "RESTRICTED"]);

/** True if the instance is under an active embargo. */
export function isEmbargoed(inst: OaInstance): boolean {
  const label = inst.accessRight?.label?.toUpperCase().trim();
  return label === "EMBARGO";
}

/**
 * Is the PRODUCT open access? The OpenAIRE Graph API leaves per-instance
 * `accessRight` null and carries the access level at the product level
 * (`bestAccessRight`), so the open/paywalled decision is made here. Any OA colour
 * (gold/hybrid/bronze/green) or a green deposit means at least one copy is
 * openly available somewhere.
 */
export function productIsOpen(product: OaProduct): boolean {
  const label = product.bestAccessRight?.label?.toUpperCase().trim();
  if (label && OPEN_LABELS.has(label)) return true;
  const color = product.openAccessColor?.toLowerCase().trim();
  if (color && color !== "closed") return true;
  return product.isGreen === true;
}

/**
 * Should this instance contribute candidate URLs? Skip embargoed and explicitly
 * CLOSED/RESTRICTED instances. Honor an explicit OPEN label. When the instance
 * carries NO access label (the common real-API case), defer to whether the
 * product is open access.
 */
function instanceEligible(inst: OaInstance, productOpen: boolean): boolean {
  if (isEmbargoed(inst)) return false;
  const label = inst.accessRight?.label?.toUpperCase().trim();
  if (label && CLOSED_LABELS.has(label)) return false;
  if (label && OPEN_LABELS.has(label)) return true;
  return productOpen;
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
  const productOpen = productIsOpen(product);

  for (const inst of product.instances ?? []) {
    if (!inst || !instanceEligible(inst, productOpen)) continue;
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
