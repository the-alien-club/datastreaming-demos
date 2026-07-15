/**
 * lib/citations/external.ts
 *
 * Derive external record URLs from a cited document's identifiers.
 *
 * Rules (from playbook/citations.md § "External URLs — derived only"):
 *   - Never store a constructed URL alongside a citation row. Storage is
 *     duplication; if the template changes, every stored URL is stale.
 *   - A citation carries only the openaireId; the DOI (and any repository URL)
 *     comes from the Document row at render time.
 *   - The side panel offers every available surface (publisher via DOI,
 *     OpenAIRE Graph record, source repository) so the researcher can pick.
 *
 * URL templates live in lib/constants.ts — the single source of truth.
 */

import { DOI_URL, OPENAIRE_RECORD_URL } from "@/lib/constants"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CitationLinks = {
  /** DOI resolver at the publisher — null when the product has no DOI. */
  doi: string | null
  /** OpenAIRE Explore record page (always available). */
  openaire: string
  /** Source repository / hosting landing page — null when unknown. */
  repository: string | null
}

/**
 * Derive all external links for a cited document.
 *
 * @param doc  The cited Document's identifiers — `openaireId` is the citation
 *             key; `doi` and `sourceRepoUrl` come from the resolved row and may
 *             be null (stub or DOI-less product).
 */
export function citationLinks(doc: {
  openaireId: string
  doi?: string | null
  sourceRepoUrl?: string | null
}): CitationLinks {
  return {
    doi: doc.doi ? DOI_URL(doc.doi) : null,
    openaire: OPENAIRE_RECORD_URL(doc.openaireId, doc.doi),
    repository: doc.sourceRepoUrl ?? null,
  }
}

/** DOI resolver URL. Thin re-export so call sites import from one location. */
export { DOI_URL as doiUrl }

/** OpenAIRE Explore record URL. */
export { OPENAIRE_RECORD_URL as openaireRecordUrl }
