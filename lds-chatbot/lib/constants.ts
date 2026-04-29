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
export const DEFAULT_MODEL_SLUG = "mistral-large-2512"

/**
 * Default LLM slug for the Start wizard. Sonnet onboards more naturally
 * for first-time users than mistral-large-2512 — picked deliberately and not
 * to be unified with `DEFAULT_MODEL_SLUG`.
 */
export const WIZARD_DEFAULT_MODEL_SLUG = "mistral-large-2512"

/**
 * MCP transport string accepted by the platform's MCP server node and the
 * `mcps.transport` column. The platform also accepts `sse` and `stdio`
 * but the chatbot only ships streamable_http for the demo.
 */
export const DEFAULT_MCP_TRANSPORT = "streamable_http"

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
