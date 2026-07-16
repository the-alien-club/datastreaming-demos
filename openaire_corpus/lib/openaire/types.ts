// lib/openaire/types.ts
// Typed subset of the hosted mcp-openaire research-product shape, as returned by
// `openaire_get_research_product_details`. This deployment (openaire.mcp.alien.club)
// returns a FLATTENED, snake_case projection of the OpenAIRE Graph — verified
// live 2026-07-16 — not the raw Graph v2 shape. The client unwraps the mcp-base
// envelope `{ success, data }` (itself inside JSON-RPC content[0].text) before
// handing the `data` object here.

export interface OaAuthor {
  name?: string | null
  orcid?: string | null
  affiliation?: string | null
}

export interface OaMetrics {
  influence?: number | null
  influence_class?: string | null
  popularity?: number | null
  popularity_class?: string | null
  impulse?: number | null
  impulse_class?: string | null
  citation_count?: number | null
  citation_class?: string | null
  downloads?: number | null
  views?: number | null
}

/** A single OpenAIRE research product (post-envelope-unwrap, flattened shape). */
export interface OaResearchProduct {
  id: string // OpenAIRE id, bare (no "50|" prefix)
  type?: string | null // publication | dataset | software | other
  instance_type?: string | null // "Article" | "Preprint" | "Review" | …
  title?: string | null
  authors?: OaAuthor[] | null
  publication_date?: string | null // "YYYY-MM-DD"
  abstract?: string | null
  doi?: string | null // bare DOI, direct
  url?: string | null // best access URL (often the doi.org resolver)
  publisher?: string | null
  journal?: string | null // container / venue
  citations?: number | null // convenience mirror of metrics.citation_count
  open_access_color?: string | null // "gold" | "hybrid" | "bronze" | null
  is_green?: boolean | null
  is_in_diamond_journal?: boolean | null
  peer_reviewed?: boolean | null
  hosted_by?: string[] | null
  collected_from?: string[] | null
  subjects?: string[] | null
  metrics?: OaMetrics | null
  language?: string | { code?: string | null } | null

  [key: string]: unknown
}
