/**
 * Pure mapping from the OpenAIRE Graph API's wide `OaProduct` into the worker's
 * stable `OaMeta`, plus the DOI extraction and the year parse. No I/O — unit-safe.
 *
 * The lane DECISION (fulltext vs abstract vs metadata) lives in the resolve stage
 * because it depends on the PDF-candidate selection (openaire/select-pdf.ts, B-M2);
 * this file only normalises the metadata record every lane carries.
 */
import type { OaMeta } from "../domain/types.js";
import { cleanSubjects } from "./fos.js";
import type { OaProduct } from "./types.js";

/** Extract the DOI from `pids[]` (scheme==="doi"), normalised lower-case, no url. */
export function extractDoi(product: OaProduct): string | null {
  for (const pid of product.pids ?? []) {
    if (pid?.scheme?.toLowerCase() === "doi" && typeof pid.value === "string" && pid.value.trim()) {
      return normalizeDoi(pid.value);
    }
  }
  return null;
}

function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
}

/** Extract the PMC id from `pids[]` (scheme==="pmc"), normalised to the "PMC…" form.
 *  OpenAIRE emits it bare as "PMC7250577"; tolerate a stray "pmc" prefix casing. */
export function extractPmcid(product: OaProduct): string | null {
  for (const pid of product.pids ?? []) {
    if (pid?.scheme?.toLowerCase() === "pmc" && typeof pid.value === "string" && pid.value.trim()) {
      const v = pid.value.trim();
      return /^pmc/i.test(v) ? `PMC${v.replace(/^pmc/i, "")}` : `PMC${v}`;
    }
  }
  return null;
}

/** Extract the PubMed id from `pids[]` (scheme==="pmid"), digits only. */
export function extractPmid(product: OaProduct): string | null {
  for (const pid of product.pids ?? []) {
    if (pid?.scheme?.toLowerCase() === "pmid" && typeof pid.value === "string" && pid.value.trim()) {
      return pid.value.trim();
    }
  }
  return null;
}

/** Parse the leading year out of a "YYYY-MM-DD"/"YYYY" publicationDate. */
export function parseYear(publicationDate: string | null | undefined): number | null {
  if (!publicationDate) return null;
  const m = /^(\d{4})/.exec(publicationDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function authorNames(product: OaProduct): string[] {
  const authors = (product.authors ?? []).filter((a): a is NonNullable<typeof a> => a != null);
  const sorted = [...authors].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const names: string[] = [];
  for (const a of sorted) {
    const name = (a.fullName ?? a.name ?? "").trim();
    if (name) names.push(name);
  }
  return names;
}

function subjectValues(product: OaProduct): string[] {
  const raw: (string | null | undefined)[] = [];
  for (const s of product.subjects ?? []) {
    raw.push(s?.subject?.value);
  }
  // FOS-clean: "0301 basic medicine" → "basic medicine"; plain keywords pass through.
  return cleanSubjects(raw);
}

/** The first non-empty description is the abstract. */
function firstAbstract(product: OaProduct): string | null {
  for (const d of product.descriptions ?? []) {
    if (typeof d === "string" && d.trim().length > 0) return d.trim();
  }
  return null;
}

/** Normalise an OaProduct into the stable OaMeta record every lane carries. */
export function toMeta(product: OaProduct, fallbackDoi: string | null): OaMeta {
  const doi = extractDoi(product) ?? fallbackDoi;
  return {
    title: (product.mainTitle ?? "").trim() || "Untitled",
    abstract: firstAbstract(product),
    authors: authorNames(product),
    year: parseYear(product.publicationDate),
    venue: product.container?.name?.trim() || null,
    publisher: product.publisher?.trim() || null,
    type: (product.type ?? "other").trim() || "other",
    doi,
    pmcid: extractPmcid(product),
    pmid: extractPmid(product),
    bestAccessRight: product.bestAccessRight?.label?.trim() || null,
    openAccessColor: product.openAccessColor?.trim() || null,
    subjects: subjectValues(product),
    citationCount:
      typeof product.indicators?.citationImpact?.citationCount === "number"
        ? product.indicators.citationImpact.citationCount
        : null,
  };
}
