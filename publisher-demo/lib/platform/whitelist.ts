import type {
  AvailableSourcesResponse,
  McpConfigurationPickerPayload,
} from "@/lib/platform/types"

/**
 * Optional env-driven whitelists that restrict which clusters and external-API
 * connectors are exposed to the demo UI. Unset / empty means "no filter — show
 * everything the platform returns for this org".
 *
 *   CLUSTER_WHITELIST=17,18,44,78
 *   CONNECTOR_WHITELIST=37,38,39,40,41
 *
 * Useful in prod where the configured org has test/internal clusters and
 * connectors that should not appear on the public demo.
 */

function parseIdList(raw: string | undefined): Set<number> | null {
  if (!raw) return null
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
  return ids.length > 0 ? new Set(ids) : null
}

export function clusterWhitelist(): Set<number> | null {
  return parseIdList(process.env.CLUSTER_WHITELIST)
}

export function connectorWhitelist(): Set<number> | null {
  return parseIdList(process.env.CONNECTOR_WHITELIST)
}

/**
 * Drop clusters / external_apis from the available-sources catalog that are
 * not present in the whitelist. Filtering at this layer means both panels
 * (Datasources + External APIs) inherit the restriction without further
 * changes — `buildView` in use-config.ts renders only what `sources` exposes.
 */
export function filterSources(sources: AvailableSourcesResponse): AvailableSourcesResponse {
  const clusters = clusterWhitelist()
  const connectors = connectorWhitelist()
  return {
    clusters: clusters
      ? sources.clusters.filter((c) => clusters.has(c.cluster_id))
      : sources.clusters,
    external_apis: connectors
      ? sources.external_apis.filter((a) => connectors.has(a.connector_id))
      : sources.external_apis,
  }
}

/**
 * Drop entries from the saved MCP configuration that the whitelist hides.
 * Keeps the draft state in `useConfig` consistent with the trimmed catalog:
 * a non-whitelisted cluster would otherwise appear as "saved but invisible",
 * still travelling back on PUT and leaking into the MCP server.
 */
export function filterConfig(
  config: McpConfigurationPickerPayload,
): McpConfigurationPickerPayload {
  const clusters = clusterWhitelist()
  const connectors = connectorWhitelist()
  return {
    clusters: clusters
      ? (config.clusters ?? []).filter((c) => clusters.has(c.cluster_id))
      : (config.clusters ?? []),
    external_apis: connectors
      ? (config.external_apis ?? []).filter((a) => connectors.has(a.connector_id))
      : (config.external_apis ?? []),
  }
}
