import { NextResponse } from "next/server"
import { adminFetch } from "@/lib/platform/admin-fetch"
import { invalidateConfigCache, resolveConfig } from "@/lib/platform/resolve-slug"
import type {
  AvailableSourcesResponse,
  DemoConfigResponse,
  McpConfigurationPickerPayload,
  McpConfigurationSummary,
} from "@/lib/platform/types"

export const dynamic = "force-dynamic"

/**
 * GET — returns the resolved configuration row + the available-sources
 * catalog in one shot. The configuration is resolved by `resolveConfig()`:
 *   1. the env-pinned `DEMO_CONFIG_SLUG` if it exists on the platform, OR
 *   2. the admin OAT user's default configuration as a fallback.
 *
 * The response includes a `resolved_via` field so the UI can hint when the
 * env slug wasn't found and the default was used instead.
 */
export async function GET() {
  try {
    const resolved = await resolveConfig()
    if (!resolved) {
      return NextResponse.json(
        {
          error: "no-mcp-configuration",
          message:
            "No MCP configuration found on the platform for this admin OAT. " +
            "Create one at /mcp/configure on the platform, or run the demo's " +
            "setup script (npm run setup:config).",
        },
        { status: 404 },
      )
    }

    const sourcesRes = await adminFetch("/mcp-configurations/available-sources")
    if (!sourcesRes.ok) {
      const body = await sourcesRes.text().catch(() => "")
      return NextResponse.json(
        {
          error: "available-sources-fetch-failed",
          status: sourcesRes.status,
          detail: body.slice(0, 400),
        },
        { status: sourcesRes.status },
      )
    }
    const sources = await unwrap<AvailableSourcesResponse>(sourcesRes)

    const response: DemoConfigResponse = {
      configuration: resolved.configuration,
      sources,
    }
    return NextResponse.json({ ...response, resolved_via: resolved.resolvedVia })
  } catch (err) {
    return NextResponse.json(
      { error: "platform-env-missing", detail: errString(err) },
      { status: 503 },
    )
  }
}

/**
 * PUT — accepts a partial picker payload and forwards it as the `config`
 * field of the platform's update endpoint, targeting whichever slug
 * `resolveConfig()` settled on.
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

  try {
    const resolved = await resolveConfig()
    if (!resolved) {
      return NextResponse.json({ error: "no-mcp-configuration" }, { status: 404 })
    }
    const res = await adminFetch(`/mcp-configurations/${resolved.slug}`, {
      method: "PUT",
      body: JSON.stringify({ config: body }),
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
    // Re-resolve next time so a slug rename (or a default flip) is picked up.
    invalidateConfigCache()
    return NextResponse.json({ configuration: updated })
  } catch (err) {
    return NextResponse.json(
      { error: "platform-env-missing", detail: errString(err) },
      { status: 503 },
    )
  }
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
