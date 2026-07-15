// lib/openaire/types.ts
// Typed subset of the OpenAIRE Graph API v2 research-product shape, as returned
// by the hosted mcp-openaire tools (openaire_kg_get_research_product /
// openaire_kg_search_research_products). Only the fields the app consumes are
// modelled; everything else is tolerated via the index signature. Verified live
// 2026-07-15 against the hosted MCP.
//
// The MCP wraps tool results in an envelope: { success, data: { header, results } }
// for search, and { success, data: <product> } for a single get. The client
// (lib/openaire/client.ts) unwraps `data` before handing records here.

export interface OaPid {
  scheme: string // "doi" | "pmid" | "pmc" | …
  value: string
}

export interface OaAuthor {
  fullName?: string | null
  name?: string | null
  surname?: string | null
  rank?: number | null
  pid?: unknown
}

export interface OaAccessRight {
  code?: string | null
  label?: string | null // "OPEN" | "EMBARGO" | "RESTRICTED" | "CLOSED" | "UNKNOWN"
  openAccessRoute?: string | null // "gold" | "green" | "hybrid" | "bronze" | null
}

export interface OaInstance {
  pids?: OaPid[] | null
  alternateIdentifiers?: OaPid[] | null
  license?: string | null
  accessRight?: OaAccessRight | null
  type?: string | null // "Article" | "Preprint" | "Part of book…" | …
  urls?: string[] | null
  refereed?: string | null // "peerReviewed" | "nonPeerReviewed" | null
  hostedBy?: { key?: string | null; value?: string | null } | null
}

export interface OaCitationImpact {
  citationCount?: number | null
  influence?: number | null
  popularity?: number | null
  impulse?: number | null
  citationClass?: string | null // C1..C5
  influenceClass?: string | null
  impulseClass?: string | null
  popularityClass?: string | null
}

export interface OaProject {
  funder?: { shortName?: string | null; name?: string | null } | null
  code?: string | null
  title?: string | null
}

/** A single OpenAIRE research product (post-envelope-unwrap). */
export interface OaResearchProduct {
  id: string // OpenAIRE id, bare (no "50|" prefix)
  mainTitle?: string | null
  subTitle?: string | null
  descriptions?: string[] | null // abstract(s)
  authors?: OaAuthor[] | null
  publicationDate?: string | null // "YYYY-MM-DD" | "YYYY"
  type?: string | null // "publication" | "dataset" | "software" | "other"
  publisher?: string | null
  container?: { name?: string | null } | null
  language?: { code?: string | null; label?: string | null } | null
  pids?: OaPid[] | null
  originalIds?: string[] | null
  openAccessColor?: string | null // "gold" | "hybrid" | "bronze" | null
  isGreen?: boolean | null
  isInDiamondJournal?: boolean | null
  bestAccessRight?: OaAccessRight | null
  indicators?: { citationImpact?: OaCitationImpact | null } | null
  instances?: OaInstance[] | null
  projects?: OaProject[] | null
  codeRepositoryUrl?: string | null
  subjects?: unknown

  [key: string]: unknown
}
