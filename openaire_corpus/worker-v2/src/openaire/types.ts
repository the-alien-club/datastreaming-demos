/**
 * OpenAIRE Graph API v2 — the typed SUBSET the worker consumes.
 *
 * The public Graph API returns a very wide `researchProduct` object. The worker
 * only needs a handful of fields (identity, title, abstract, authors, access
 * flags, and the instances that carry candidate PDF urls). This file is the
 * ground-truth shape for those fields, mirroring the MCP's `models/graph_v2.py`
 * (verified against the live API) — everything is optional because the API omits
 * fields freely, so the client normalises into the stable `OaMeta` (domain/types).
 *
 * Errors: the client throws a typed error the resolve stage classifies —
 * `PermanentOpenAireError` (404 / malformed id → skip the doc) vs.
 * `TransientOpenAireError` (5xx / network → retry).
 */

/** A persistent identifier (doi, pmid, handle, …). */
export interface OaPid {
  scheme?: string | null;
  value?: string | null;
}

/** An author entry. `rank` orders them; we sort by it when present. */
export interface OaAuthor {
  fullName?: string | null;
  name?: string | null;
  rank?: number | null;
}

/** Best access right label — OPEN | CLOSED | EMBARGO | RESTRICTED | UNKNOWN. */
export interface OaBestAccessRight {
  code?: string | null;
  label?: string | null;
  scheme?: string | null;
}

export interface OaAccessRight {
  code?: string | null;
  label?: string | null;
  openAccessRoute?: string | null;
  scheme?: string | null;
}

export interface OaKeyValue {
  key?: string | null;
  value?: string | null;
}

/** A subject/keyword. The API nests the string under `subject.value`. */
export interface OaSubject {
  subject?: { scheme?: string | null; value?: string | null } | null;
}

export interface OaContainer {
  name?: string | null;
}

export interface OaLanguage {
  code?: string | null;
  label?: string | null;
}

/** One manifestation of a product — carries the candidate PDF urls + access. */
export interface OaInstance {
  urls?: string[] | null;
  license?: string | null;
  accessRight?: OaAccessRight | null;
  type?: string | null;
  refereed?: string | null;
  hostedBy?: OaKeyValue | null;
  collectedFrom?: OaKeyValue | null;
}

export interface OaCitationImpact {
  citationCount?: number | null;
  influenceClass?: string | null;
}

export interface OaIndicators {
  citationImpact?: OaCitationImpact | null;
}

/** A research product as returned by GET /researchProducts/<id>?format=json. */
export interface OaProduct {
  id?: string | null;
  mainTitle?: string | null;
  subTitle?: string | null;
  descriptions?: string[] | null;
  type?: string | null;
  language?: OaLanguage | null;
  authors?: OaAuthor[] | null;
  publicationDate?: string | null;
  publisher?: string | null;
  container?: OaContainer | null;
  embargoEndDate?: string | null;
  pids?: OaPid[] | null;
  bestAccessRight?: OaBestAccessRight | null;
  openAccessColor?: string | null;
  isGreen?: boolean | null;
  subjects?: OaSubject[] | null;
  instances?: OaInstance[] | null;
  indicators?: OaIndicators | null;
  codeRepositoryUrl?: string | null;
}
