// Centralised string constants used across the app and API.
//
// Magic strings spread across 13+ call sites caused the "wrong default
// model on creation" class of bug (QA_FIX 2026-04-25 §P1-3). Adding new
// constants here is preferred over re-introducing string literals.

/**
 * Default LLM slug used everywhere except the onboarding wizard. Keep in
 * sync with the platform's `/ai-models?select=public&modelType=llm`
 * response — a slug that the platform doesn't recognise produces an
 * empty-content chat (the agent runs but emits no tokens).
 */
export const DEFAULT_MODEL_SLUG = "mistral-medium-3.5"

/**
 * Default LLM slug for the Start wizard. Sonnet onboards more naturally
 * for first-time users than mistral-large-2512 — picked deliberately and not
 * to be unified with `DEFAULT_MODEL_SLUG`.
 */
export const WIZARD_DEFAULT_MODEL_SLUG = "mistral-medium-3.5"

/**
 * All three transport modes accepted by the platform's MCP server node and
 * the `mcps.transport` column. Use these instead of bare string literals.
 */
export const MCP_TRANSPORT = {
  StreamableHttp: "streamable_http",
  Sse: "sse",
  Stdio: "stdio",
} as const
export type McpTransport = (typeof MCP_TRANSPORT)[keyof typeof MCP_TRANSPORT]

/**
 * Default MCP transport for new MCP server entries.
 */
export const DEFAULT_MCP_TRANSPORT = MCP_TRANSPORT.StreamableHttp

/**
 * Pipeline preset applied to every freshly-created dataset. The preset
 * is documented in the data-cluster `pipelines` registry.
 */
export const DEFAULT_DATASET_PIPELINE_PRESET = "general_purpose"

/**
 * Header forwarded to the platform with the user's Authentik OAuth access
 * token so platform routes can authorise requests as that user.
 */
export const PLATFORM_OAUTH_TOKEN_HEADER = "x-oauth-access-token"

/**
 * better-auth provider id for our Authentik OIDC integration.
 */
export const OAUTH_PROVIDER_ID = "authentik"

/**
 * Application route paths that appear in more than one file. Import from here
 * rather than repeating the string inline.
 */
export const ROUTES = {
  AGENTS: "/agents",
  AGENTS_NEW: "/agents/new",
  DATASETS: "/datasets",
  DATASETS_NEW: "/datasets/new",
  SPECIALISTS: "/specialists",
  MCPS: "/mcps",
  CONVERSATIONS: "/conversations",
} as const

/**
 * How often the dataset detail page re-polls cluster entry statuses while
 * any entry is still in progress.
 */
export const ENTRY_POLL_INTERVAL_MS = 10_000

/**
 * How often the wizard's done step re-polls dataset processing status while
 * waiting for documents to finish indexing.
 */
export const WIZARD_DATASET_POLL_INTERVAL_MS = 5_000

/**
 * Well-known ID of the built-in data-cluster MCP. Used wherever the chatbot
 * auto-wires a corpus subagent or resolves the MCP server URL from the env.
 */
export const DATACLUSTER_MCP_ID = "datacluster"
