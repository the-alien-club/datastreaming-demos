/**
 * Canonical tool-name constants.
 *
 * Tool names use underscores throughout because `defineTool` (chat-sdk)
 * validates against `^[a-zA-Z0-9_-]{1,64}$`, which rejects dots.
 * The dot-separated form shown in the design docs (e.g. "corpus.get_state")
 * is the conceptual grouping — the wire names on the wire are underscore-separated.
 *
 * MCP tool names use the `<serverName>__<toolName>` prefix convention that
 * `createToolRegistry` applies automatically when building the Anthropic tool
 * list (see playbook/mcp-client.md).
 */
export const AGENT_TOOLS = {
  // --- Corpus tools -----------------------------------------------------------
  corpusGetState:       "corpus_get_state",
  corpusList:           "corpus_list",
  corpusAdd:            "corpus_add",
  corpusRemove:         "corpus_remove",
  corpusRemoveByFilter: "corpus_remove_by_filter",
  corpusStats:          "corpus_stats",
  corpusDiff:           "corpus_diff",
  corpusAggregate:      "corpus_aggregate",

  // --- Memory tools -----------------------------------------------------------
  memoryRead:  "memory_read",
  memoryWrite: "memory_write",

  // --- Ingestion tools --------------------------------------------------------
  ingestSubmit: "ingest_submit",

  // --- RAG tools --------------------------------------------------------------
  ragQuery:         "rag_query",
  ragKeywordSearch: "rag_keyword_search",
  ragGetText:       "rag_get_text",
  ragListFigures:   "rag_list_figures",

  // --- Note tools -------------------------------------------------------------
  noteList:   "note_list",
  noteGet:    "note_get",
  noteCreate: "note_create",
  noteUpdate: "note_update",
  noteAppend: "note_append",

  // --- Document tools ---------------------------------------------------------
  docGet: "doc_get",

  // --- Interaction tools ------------------------------------------------------
  // Ends the turn and renders an interactive multiple-choice chooser; the user's
  // selections come back as the next user message. See lib/agent/tools/interaction.ts.
  askUser: "ask_user",

  // --- OpenAIRE MCP tools (prefixed by the MCP server name "openaire") -------
  // These are NOT registered via defineTool — they come from the MCP server.
  // Listed here so the prompt-builder and the SSE event labels can reference
  // them by a typed key rather than a magic string. Names verified live against
  // the hosted mcp-openaire at openaire.mcp.alien.club (2026-07-16).
  openaireSearchProducts: "openaire__openaire_search_research_products",
  openaireGetProduct:     "openaire__openaire_get_research_product_details",
  openaireSearchProjects: "openaire__openaire_search_projects",
  openaireResearchLinks:  "openaire__openaire_get_research_links",
  openaireCitationNetwork: "openaire__openaire_get_citation_network",
} as const

export type AgentToolName = (typeof AGENT_TOOLS)[keyof typeof AGENT_TOOLS]
