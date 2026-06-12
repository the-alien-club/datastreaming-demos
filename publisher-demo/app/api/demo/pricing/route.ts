import { NextResponse } from "next/server"
import { adminFetch } from "@/lib/platform/admin-fetch"
import { resolveConfig } from "@/lib/platform/resolve-slug"
import type {
  AvailableSourcesResponse,
  DemoPricingResponse,
  PricingMap,
} from "@/lib/platform/types"

export const dynamic = "force-dynamic"

/**
 * Build a flat pricing map from the platform's authoritative sources:
 *   - `dataset:<id>` → € per hit (from `Dataset.access_price`)
 *   - `<tool_name>`  → € per call (from `external_api_endpoint.unit_price_cents / 100`)
 *
 * Server-side because the wire shape spans `/datasets/:id` (one call per
 * dataset in the configuration) and `/external-apis/:id/endpoints` (one
 * call per connector). The frontend's `usePricing` hook reads this once and
 * `computeRoyalty()` looks up `(toolName, args)` against the map.
 */
export async function GET() {
  try {
    const [resolved, sourcesRes] = await Promise.all([
      resolveConfig(),
      adminFetch("/mcp-configurations/available-sources"),
    ])
    if (!resolved) {
      return NextResponse.json({ pricing: {} as PricingMap })
    }
    if (!sourcesRes.ok) return errFor("available-sources-fetch-failed", sourcesRes)

    const config = resolved.configuration
    const sources = await unwrap<AvailableSourcesResponse>(sourcesRes)
    const pricing: PricingMap = {}

    // Datasets — gather every dataset id referenced by the configuration AND
    // every dataset surfaced by the catalog so the map covers both selected
    // and selectable items (the picker can show projected royalties even for
    // datasets the user hasn't enabled yet).
    const datasetIds = new Set<number>()
    for (const cluster of config.config.clusters ?? []) {
      for (const id of cluster.dataset_ids ?? []) datasetIds.add(id)
    }
    for (const cluster of sources.clusters) {
      for (const ds of cluster.datasets) datasetIds.add(ds.id)
    }

    await Promise.all(
      Array.from(datasetIds).map(async (id) => {
        const r = await adminFetch(`/datasets/${id}`)
        if (!r.ok) return
        const ds = await unwrap<{
          access_price?: number
          accessPrice?: number
        }>(r)
        const price = Number(ds.access_price ?? ds.accessPrice ?? 0)
        if (Number.isFinite(price) && price > 0) {
          pricing[`dataset:${id}`] = price
        }
      }),
    )

    // External-API tools — for each connector in the catalog, list its
    // endpoints and derive the tool name with the same algorithm the
    // platform's mcp_tool_builder uses, then read `unit_price_cents`.
    await Promise.all(
      sources.external_apis.map(async (connector) => {
        const r = await adminFetch(`/external-apis/${connector.connector_id}/endpoints`)
        if (!r.ok) return
        const body = await r.json().catch(() => null)
        if (!body) return
        const endpoints = extractEndpointArray(body)
        for (const ep of endpoints) {
          const operationId = (ep.operation_id ?? ep.operationId ?? null) as string | null
          const method = String(ep.method ?? "GET")
          const path = String(ep.path ?? "")
          const toolName = deriveToolName(connector.slug, operationId, method, path)
          const cents = Number(ep.unit_price_cents ?? ep.unitPriceCents ?? 0)
          if (Number.isFinite(cents) && cents > 0) {
            const price = cents / 100
            for (const key of nameVariants(toolName)) {
              pricing[key] = price
            }
          }
        }
      }),
    )

    const response: DemoPricingResponse = { pricing }
    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json(
      { error: "platform-env-missing", detail: errString(err) },
      { status: 503 },
    )
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}

async function errFor(error: string, res: Response): Promise<Response> {
  const detail = await res.text().catch(() => "")
  return NextResponse.json(
    { error, status: res.status, detail: detail.slice(0, 400) },
    { status: res.status },
  )
}

function errString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * The endpoints list endpoint may return either a bare array or a paginated
 * envelope (`{ data: [], meta: {} }`). Normalise here.
 */
function extractEndpointArray(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>
    if (Array.isArray(b.data)) return b.data as Array<Record<string, unknown>>
    if (b.data && typeof b.data === "object") {
      const inner = (b.data as Record<string, unknown>).data
      if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>
    }
  }
  return []
}

// ── tool name derivation (mirrors web-app/packages/backend/lib/utils/strings.ts
//    and app/services/mcp_tool_builder.ts so the demo's pricing keys match the
//    names the platform actually emits in tool calls) ─────────────────────────

function toSnakeCase(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
}

function pathToOpId(method: string, path: string): string {
  const cleaned = path.replace(/\{([^}]+)\}/g, "$1").replace(/\//g, " ").trim()
  return `${method.toLowerCase()} ${cleaned}`
}

function deriveToolName(
  slug: string,
  operationId: string | null,
  method: string,
  path: string,
): string {
  const candidate = operationId || pathToOpId(method, path)
  const suffix = toSnakeCase(candidate)
  if (!suffix) return `${slug}_${method.toLowerCase()}`
  return `${slug}_${suffix}`
}

/**
 * Different MCP servers normalise the connector slug differently in the
 * tool name they expose: BNF servers convert dashes to underscores
 * (`bnf_gallica_api_*`), OpenAIRE preserves them (`openaire-…-api_*`). We
 * write the price under BOTH forms so the frontend's lookup hits either
 * way, since there is no single rule that matches every MCP server.
 */
function nameVariants(name: string): string[] {
  return Array.from(new Set([name, name.replace(/-/g, "_")]))
}
