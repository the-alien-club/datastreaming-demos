/**
 * Resolve the slug-addressed MCP configuration the demo should use.
 *
 * Order of resolution:
 *   1. `env.DEMO_CONFIG_SLUG` — preferred, if the row exists on the platform.
 *   2. The user's default configuration (`GET /mcp-configurations/list` → row
 *      with `is_default: true`) — fallback so the demo works for any admin
 *      OAT that already has at least one configuration. Sales-friendly: no
 *      manual bootstrap required.
 *
 * Returns the resolved slug + the matching summary. If neither resolves,
 * returns null so the caller can surface a clear setup-instructions error.
 *
 * Cached per request (memoization is fine because Next.js spins a fresh
 * module context per cold start; a stale cache here is harmless).
 */

import { env } from "../env"
import { adminFetch } from "./admin-fetch"
import type { McpConfigurationSummary } from "./types"

let cached: { slug: string; configuration: McpConfigurationSummary } | null = null

export interface ResolvedConfig {
  slug: string
  configuration: McpConfigurationSummary
  resolvedVia: "env" | "default"
}

export async function resolveConfig(): Promise<ResolvedConfig | null> {
  if (cached) {
    try {
      const res = await adminFetch(`/mcp-configurations/${cached.slug}`)
      if (res.ok) {
        const data = await unwrap<McpConfigurationSummary>(res)
        cached = { slug: data.slug, configuration: data }
        return { slug: data.slug, configuration: data, resolvedVia: "env" }
      }
      // cache invalidated by upstream change — drop and re-resolve
      cached = null
    } catch {
      cached = null
    }
  }

  // 1. Try env-pinned slug.
  const envSlug = env.DEMO_CONFIG_SLUG
  const envRes = await adminFetch(`/mcp-configurations/${envSlug}`)
  if (envRes.ok) {
    const data = await unwrap<McpConfigurationSummary>(envRes)
    cached = { slug: data.slug, configuration: data }
    return { slug: data.slug, configuration: data, resolvedVia: "env" }
  }

  // 2. Fall back to the admin user's default config.
  const listRes = await adminFetch("/mcp-configurations/list")
  if (!listRes.ok) return null
  const list = await unwrap<McpConfigurationSummary[]>(listRes)
  if (!Array.isArray(list) || list.length === 0) return null
  const defaultRow = list.find((r) => r.is_default) ?? list[0]
  cached = { slug: defaultRow.slug, configuration: defaultRow }
  return { slug: defaultRow.slug, configuration: defaultRow, resolvedVia: "default" }
}

export function invalidateConfigCache(): void {
  cached = null
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}
