import { NextResponse } from "next/server"
import { adminFetch } from "@/lib/platform/admin-fetch"
import { getOrCreateUserConfig } from "@/lib/platform/per-user-config"
import type {
  DemoConfigResponse,
  McpConfigurationPickerPayload,
  McpConfigurationSummary,
} from "@/lib/platform/types"
import { clusterWhitelist, connectorWhitelist } from "@/lib/platform/whitelist"

export const dynamic = "force-dynamic"

const CONFIG_SLUG_HEADER = "x-demo-config-slug"

/**
 * GET — returns the per-browser MCP configuration row + the available-sources
 * catalog in one shot. The configuration is resolved by `getOrCreateUserConfig`:
 *   1. The browser's `x-demo-config-slug` header (its localStorage value), OR
 *   2. The env-pinned `DEMO_CONFIG_SLUG` as a one-time bootstrap fallback, OR
 *   3. A freshly created "whitelist all" configuration owned by the admin OAT
 *      user (the new slug is returned so the browser can persist it).
 *
 * The response always includes the canonical `slug` field — the client must
 * write it back to localStorage so a returning visitor or a 404-on-stale-slug
 * scenario heals transparently. `resolved_via` reports which branch fired.
 */
export async function GET(request: Request) {
  const slug = readConfigSlugHeader(request)

  try {
    const resolved = await getOrCreateUserConfig(slug)
    const response: DemoConfigResponse = {
      slug: resolved.slug,
      configuration: resolved.configuration,
      sources: resolved.sources,
      resolved_via: resolved.resolvedVia,
    }

    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json(
      { error: "platform-env-missing", detail: errString(err) },
      { status: 503 },
    )
  }
}

/**
 * PUT — accepts a partial picker payload and forwards it as the `config`
 * field of the platform's update endpoint, targeting the slug resolved for
 * this browser. The header must already match a row the resolver can find;
 * a missing/stale slug triggers the same resolve-or-create path the GET uses
 * so the picker can edit a freshly minted config on its very first save.
 */
export async function PUT(request: Request) {
  let body: McpConfigurationPickerPayload
  try {
    body = (await request.json()) as McpConfigurationPickerPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || !Array.isArray(body.clusters) || !Array.isArray(body.external_apis)) {
    return NextResponse.json(
      { error: "Body must contain { clusters[], external_apis[] }" },
      { status: 400 },
    )
  }

  const slug = readConfigSlugHeader(request)

  try {
    const resolved = await getOrCreateUserConfig(slug)

    // The UI only saw whitelisted entries, so its payload only references
    // them. Re-attach any saved entries that the whitelist hides, otherwise
    // a save would silently delete them from the platform configuration.
    const clusters = clusterWhitelist()
    const connectors = connectorWhitelist()
    const saved = resolved.configuration.config
    const mergedConfig: McpConfigurationPickerPayload = {
      clusters: [
        ...body.clusters,
        ...(clusters ? (saved.clusters ?? []).filter((c) => !clusters.has(c.cluster_id)) : []),
      ],
      external_apis: [
        ...body.external_apis,
        ...(connectors
          ? (saved.external_apis ?? []).filter((a) => !connectors.has(a.connector_id))
          : []),
      ],
    }

    const res = await adminFetch(`/mcp-configurations/${resolved.slug}`, {
      method: "PUT",
      body: JSON.stringify({ config: mergedConfig }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return NextResponse.json(
        {
          error: "configuration-update-failed",
          status: res.status,
          detail: detail.slice(0, 400),
        },
        { status: res.status },
      )
    }
    const updated = await unwrap<McpConfigurationSummary>(res)
    return NextResponse.json({ slug: resolved.slug, configuration: updated })
  } catch (err) {
    return NextResponse.json(
      { error: "platform-env-missing", detail: errString(err) },
      { status: 503 },
    )
  }
}

/**
 * Read the per-browser slug header. The browser sends it on every request
 * once `localStorage` has been populated; the resolver tolerates both an
 * absent header (first visit) and a malformed value (the regex check lives
 * in `getOrCreateUserConfig`).
 */
function readConfigSlugHeader(request: Request): string | null {
  const raw = request.headers.get(CONFIG_SLUG_HEADER)
  return raw && raw.length > 0 ? raw : null
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}

function errString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
