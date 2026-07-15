import "server-only"
// lib/agent/prompts/openaire-knowledge.ts
// Static OpenAIRE domain knowledge injected into the corpus agent prompt.
// Facts the agent needs to use the OpenAIRE MCP tools correctly — verified live
// against the hosted mcp-openaire (2026-07-15).

export const OPENAIRE_IDENTIFIERS_GUIDE = `## IDENTIFIERS — OpenAIRE id vs DOI

Every research product has an **OpenAIRE id** (e.g. \`doi_dedup___::0123abcd…\`, sometimes \`openaire____::…\`). This is the stable corpus key. Many — but NOT all — products also have a **DOI** (e.g. \`10.1038/nbt.2647\`); datasets, software, and grey literature often have none.

- \`openaire__openaire_kg_search_research_products\` returns each hit's \`id\` (the OpenAIRE id) and its \`pids\` (DOI/PMID/PMC). Use the \`id\` to add to the corpus.
- \`corpus_add\` accepts EITHER an OpenAIRE id OR a DOI — a DOI is resolved to its OpenAIRE id server-side. Prefer passing the \`id\` from search results directly.
- \`openaire__openaire_kg_get_research_product\` dereferences by OpenAIRE id ONLY — a raw DOI is rejected. corpus_add and the background resolver handle this for you.
- Never fabricate an id or a DOI. If the user pastes a DOI, pass it as-is to corpus_add.`

export const OPENAIRE_SEARCH_GUIDE = `## SEARCHING THE GRAPH

\`openaire__openaire_kg_search_research_products\` is the discovery tool. Key facts:

- **Keyword AND semantics (the opposite of Google):** the \`search\` / \`mainTitle\` / \`description\` fields combine terms with AND by default, so MORE terms = FEWER hits. If a query returns nothing, DROP terms rather than adding them, or use explicit \`OR\` (uppercase) between alternatives.
- Filters compose: \`fromPublicationDate\`/\`toPublicationDate\` (YYYY or YYYY-MM-DD), \`type\` (publication|dataset|software|other), \`isPeerReviewed\`, \`openAccessColor\` (gold|hybrid|bronze), \`isGreen\`, \`bestOpenAccessRightLabel\` (OPEN|EMBARGO|RESTRICTED|CLOSED), \`authorFullName\`, \`authorOrcid\`, \`fos\` (Field of Science), \`sdg\`, \`relProjectFundingShortName\`, and the bibliometric classes \`influenceClass\`/\`popularityClass\`/\`impulseClass\`/\`citationCountClass\` (C1=top 0.01% … C5=average).
- **Pagination:** \`page\`/\`pageSize\` (basic, up to 10 000 records) or \`cursor='*'\` then follow \`nextCursor\` (for larger sweeps). Be EXHAUSTIVE when the user asks for "all" — keep paging until the result set is covered.
- **Null-heavy responses are normal:** authors, countries, subjects, openAccessColor legitimately come back null. Treat null as "unknown", never as zero or "closed".
- Known quirks: combining \`fos\` + \`search\` + \`type=['dataset']\` can return 0; \`instanceType\` may silently shrink results. If a rich filter returns nothing, relax it.`

export const OPENAIRE_CITATIONS_GUIDE = `## CITATION & RELATIONSHIP EDGES

The search/get tools return a product's metadata but NOT its citation edges. For "what cites this / what does this cite / related outputs":

- \`openaire__openaire_kg_get_research_links\` — relations for a product by PID (relType is accurate here).
- \`openaire__openaire_sx_search_links\` — ScholeXplorer links, keyed by **DOI** (\`sourcePid\`/\`targetPid\`); the semantic relation is in \`SubType\`, not \`Name\`. A product with NO DOI has no ScholeXplorer edges — say so rather than inventing them. Page with \`size ≤ 45\` (larger sizes are unreliable).

The detail panel already shows cited-by / references / related counts for corpus documents; use these tools only when the user asks to expand the citation network.`

export const OPENAIRE_ACCESS_GUIDE = `## OPEN ACCESS & PEER REVIEW

OpenAIRE splits open-access signal across three fields, collapsed in this app into one bucket per document:
- \`openAccessColor\` = gold | hybrid | bronze (only these three).
- \`isGreen\` = a self-archived open copy exists (the "green" route).
- \`bestAccessRight\` = OPEN | EMBARGO | RESTRICTED | CLOSED | UNKNOWN — "closed" comes from here.
The corpus facets expose buckets gold/hybrid/bronze/green/closed. When the user asks about openness, use the OA facet and the "open-access rate" summary, not raw guesses. Peer-review is a per-instance \`refereed\` flag surfaced as a tri-state (peer-reviewed / not / unknown) — never assume unknown means "not peer-reviewed".`
