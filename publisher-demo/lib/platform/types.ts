/**
 * Wire types mirroring the platform backend exactly. Sources of truth:
 *   - web-app/packages/backend/app/controllers/mcp_configurations_controller.ts
 *   - web-app/packages/backend/app/validators/mcp_configuration_validator.ts
 *   - web-app/packages/backend/app/services/mcp_tool_builder.ts (MCPToolUIDescriptor)
 *
 * If the backend evolves, edit this file before touching call sites.
 */

export type McpConfigurationVisibility = "private" | "org" | "public"

/** Tool descriptor as projected for the picker / available-sources catalog. */
export interface McpToolUIDescriptor {
  name: string
  description: string
  tags: string[]
  required_abilities: string[]
  input_schema: Record<string, unknown>
  annotations: Record<string, unknown>
}

/** Dataset projection inside an AvailableCluster. */
export interface AvailableDataset {
  id: number
  slug: string
  name: string
  is_public: boolean
}

/** One cluster the user can configure on their MCP profile. */
export interface AvailableCluster {
  cluster_id: number
  name: string
  description: string
  tools: McpToolUIDescriptor[]
  datasets: AvailableDataset[]
}

/** One external-API connector the user can proxy. */
export interface AvailableExternalApi {
  connector_id: number
  slug: string
  name: string
  description: string | null
  tools: McpToolUIDescriptor[]
}

/** Response of `GET /mcp-configurations/available-sources`. */
export interface AvailableSourcesResponse {
  clusters: AvailableCluster[]
  external_apis: AvailableExternalApi[]
}

/** One cluster entry inside the picker config payload. */
export interface ConfigClusterEntry {
  cluster_id: number
  tools: string[]
  dataset_ids?: number[]
}

/** One external-API entry inside the picker config payload. */
export interface ConfigExternalApiEntry {
  connector_id: number
  tools: string[]
}

/** The validated `config` JSONB shape. */
export interface McpConfigurationPickerPayload {
  clusters: ConfigClusterEntry[]
  external_apis: ConfigExternalApiEntry[]
}

/** Response of `GET /mcp-configurations/:slug` (one row). */
export interface McpConfigurationSummary {
  slug: string
  name: string
  is_default: boolean
  visibility: McpConfigurationVisibility
  organization_id: number | null
  config: McpConfigurationPickerPayload
  created_at: string
  updated_at: string
}

/**
 * Demo-internal combined response. The frontend's `useConfig` fetches this
 * single endpoint to populate both the picker tree and the source catalog.
 *
 * `slug` is the canonical per-browser configuration id. The client always
 * overwrites `localStorage` with this value on every successful response so
 * an env-bootstrap or a server-side recreate (because the prior slug 404'd)
 * is picked up transparently.
 *
 * `resolved_via` reports how the slug was determined this turn:
 *   - `"client"` — the browser supplied a slug via the `x-demo-config-slug`
 *     header and it resolved.
 *   - `"env-fallback"` — no client slug, but `env.DEMO_CONFIG_SLUG` was set
 *     and resolved (one-time bootstrap path).
 *   - `"created"` — neither resolved, server created a fresh row.
 */
export interface DemoConfigResponse {
  slug: string
  configuration: McpConfigurationSummary
  sources: AvailableSourcesResponse
  resolved_via: "client" | "env-fallback" | "created"
}

/**
 * Pricing map keyed by:
 *   - `"dataset:<id>"`   → € per hit (from `Dataset.accessPrice`)
 *   - `"<tool_name>"`    → € per call (from external endpoint pricing)
 */
export type PricingMap = Record<string, number>

/** Response of `GET /api/demo/pricing`. */
export interface DemoPricingResponse {
  pricing: PricingMap
}
