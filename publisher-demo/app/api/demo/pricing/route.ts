import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { adminFetch } from "@/lib/platform/admin-fetch"

export const dynamic = "force-dynamic"

/**
 * Returns a flat pricing map keyed by:
 *   - tool name (e.g. "crossref_search_works") → € per call
 *   - dataset id (numeric string) → € per hit (from Dataset.accessPrice)
 *
 * Resolved server-side because it spans mcp-configurations,
 * external-api-endpoints, and datasets endpoints.
 */
export async function GET() {
  try {
    const cfgRes = await adminFetch(`/mcp-configurations/${env.DEMO_CONFIG_SLUG}`)
    if (!cfgRes.ok) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 })
    }
    const cfg = await cfgRes.json()

    const pricing: Record<string, number> = {}

    const datasetIds: number[] = (cfg?.config?.clusters ?? []).flatMap(
      (c: { dataset_ids?: number[] }) => c.dataset_ids ?? [],
    )
    for (const id of datasetIds) {
      const r = await adminFetch(`/datasets/${id}`)
      if (r.ok) {
        const ds = await r.json()
        const price = Number(ds?.data?.accessPrice ?? ds?.accessPrice ?? 0)
        if (Number.isFinite(price) && price > 0) pricing[`dataset:${id}`] = price
      }
    }

    const connectorIds: number[] = (cfg?.config?.external_apis ?? []).map(
      (a: { connector_id: number }) => a.connector_id,
    )
    for (const id of connectorIds) {
      const r = await adminFetch(`/external-api-connectors/${id}?expand=endpoints`)
      if (r.ok) {
        const conn = await r.json()
        const endpoints = conn?.data?.endpoints ?? conn?.endpoints ?? []
        for (const ep of endpoints) {
          const toolName = ep?.toolName ?? ep?.tool_name ?? ep?.slug
          const price = Number(ep?.unitPrice ?? ep?.unit_price ?? 0)
          if (toolName && Number.isFinite(price) && price > 0) pricing[String(toolName)] = price
        }
      }
    }

    return NextResponse.json({ pricing })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pricing fetch failed" },
      { status: 500 },
    )
  }
}
