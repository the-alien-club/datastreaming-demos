/**
 * Resolve or create the per-browser MCP configuration for a demo session.
 *
 * Replaces the prior single-config `resolve-slug.ts` (which kept a
 * module-level cache shared across all concurrent users). This module is
 * stateless: every call resolves fresh against the platform so two
 * browsers cannot end up pointing at the same slug by accident.
 *
 * Resolution order:
 *   1. If the browser sent `x-demo-config-slug` (its localStorage entry),
 *      try `GET /mcp-configurations/{slug}`. Hit → return it.
 *   2. Otherwise, if `env.DEMO_CONFIG_SLUG` is set, try that as a one-time
 *      bootstrap fallback (useful for fixed demo presentations).
 *   3. Otherwise, build a "whitelist all" config from
 *      `GET /mcp-configurations/available-sources`, `POST` it, return the
 *      newly minted row. The slug is the only thing the browser persists.
 *
 * `ADMIN_OAT` stays server-side throughout — the browser only sees the
 * opaque `cfg_*` slug.
 */

import { env } from "../env"
import { adminFetch } from "./admin-fetch"
import type {
  AvailableSourcesResponse,
  McpConfigurationPickerPayload,
  McpConfigurationSummary,
} from "./types"
import { filterConfig, filterSources } from "./whitelist"

export type ResolvedVia = "client" | "env-fallback" | "created"

export interface ResolvedUserConfig {
  slug: string
  configuration: McpConfigurationSummary
  sources: AvailableSourcesResponse
  resolvedVia: ResolvedVia
}

/**
 * Resolve the demo's MCP configuration for a request, creating a fresh
 * per-user row when neither the client's slug nor the env bootstrap slug
 * resolves. Always returns a usable `{slug, configuration, sources}` or
 * throws on a hard platform failure (e.g. available-sources fetch error).
 */
export async function getOrCreateUserConfig(slug: string | null): Promise<ResolvedUserConfig> {
  // 1. client-supplied slug
  if (slug && isValidSlug(slug)) {
    const res = await adminFetch(`/mcp-configurations/${slug}`)
    if (res.ok) {
      const configuration = await unwrap<McpConfigurationSummary>(res)
      return await attachSources({ slug: configuration.slug, configuration, resolvedVia: "client" })
    }
  }

  // 2. env-pinned bootstrap fallback
  if (env.DEMO_CONFIG_SLUG) {
    const res = await adminFetch(`/mcp-configurations/${env.DEMO_CONFIG_SLUG}`)
    if (res.ok) {
      const configuration = await unwrap<McpConfigurationSummary>(res)
      return await attachSources({
        slug: configuration.slug,
        configuration,
        resolvedVia: "env-fallback",
      })
    }
  }

  // 3. create fresh
  const sourcesRes = await adminFetch("/mcp-configurations/available-sources")
  if (!sourcesRes.ok) {
    const detail = await sourcesRes.text().catch(() => "")
    throw new Error(
      `available-sources fetch failed (${sourcesRes.status}): ${detail.slice(0, 300)}`,
    )
  }
  const rawSources = await unwrap<AvailableSourcesResponse>(sourcesRes)
  const configPayload = buildWhitelistAllPayload(rawSources)
  const createRes = await adminFetch("/mcp-configurations", {
    method: "POST",
    body: JSON.stringify({
      name: `demo-publisher-${shortRandom()}`,
      visibility: "private",
      is_default: false,
      config: configPayload,
    }),
  })
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "")
    throw new Error(`config create failed (${createRes.status}): ${detail.slice(0, 300)}`)
  }
  const configuration = await unwrap<McpConfigurationSummary>(createRes)
  return await attachSources(
    { slug: configuration.slug, configuration, resolvedVia: "created" },
    rawSources,
  )
}

/**
 * Build the "whitelist all" payload for `POST /mcp-configurations` from a
 * sources catalog. Enumerates every cluster + tools[] (no dataset_ids =
 * all datasets accessible) and every connector + tools[]. Intersects with
 * `CLUSTER_WHITELIST` / `CONNECTOR_WHITELIST` env vars via `filterSources`
 * so the auto-created config matches exactly what the picker UI shows.
 */
export function buildWhitelistAllPayload(
  sources: AvailableSourcesResponse,
): McpConfigurationPickerPayload {
  const filtered = filterSources(sources)
  return {
    clusters: filtered.clusters.map((c) => ({
      cluster_id: c.cluster_id,
      tools: c.tools.map((t) => t.name),
    })),
    external_apis: filtered.external_apis.map((a) => ({
      connector_id: a.connector_id,
      tools: a.tools.map((t) => t.name),
    })),
  }
}

/**
 * Attach the whitelist-filtered sources catalog (and trim the saved config
 * to whitelisted entries) so the response the browser receives is in lockstep
 * with the picker UI. Reuses `rawSources` when the caller already fetched it.
 */
async function attachSources(
  partial: Omit<ResolvedUserConfig, "sources">,
  rawSources?: AvailableSourcesResponse,
): Promise<ResolvedUserConfig> {
  let raw = rawSources
  if (!raw) {
    const res = await adminFetch("/mcp-configurations/available-sources")
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`available-sources fetch failed (${res.status}): ${detail.slice(0, 300)}`)
    }
    raw = await unwrap<AvailableSourcesResponse>(res)
  }
  return {
    ...partial,
    configuration: {
      ...partial.configuration,
      config: filterConfig(partial.configuration.config),
    },
    sources: filterSources(raw),
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}

/**
 * Defensive: reject obviously malformed slugs before we send them to the
 * platform. The backend's regex is `^cfg_[A-Za-z0-9_-]{6,64}$`; matching it
 * here prevents a bad localStorage value from triggering an HTTP round trip.
 */
function isValidSlug(slug: string): boolean {
  return /^cfg_[A-Za-z0-9_-]{6,64}$/.test(slug)
}

function shortRandom(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}
