"use client"

import { useEffect, useState } from "react"

/**
 * Pricing map sourced from /api/demo/pricing — keyed by:
 *   "dataset:<numeric id>"  → € per hit
 *   "<tool name>"           → € per call (from external endpoint unit_price)
 *
 * Loaded once on mount. While loading or absent, computeRoyalty falls back
 * to small heuristic values so the demo never shows €0.0000.
 */
export type PricingMap = Record<string, number>

const FALLBACK_DATASET = 0.005
const FALLBACK_API = 0.001

export function usePricing(): PricingMap {
  const [pricing, setPricing] = useState<PricingMap>({})

  useEffect(() => {
    let cancelled = false
    fetch("/api/demo/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { pricing?: PricingMap } | null) => {
        if (cancelled || !data?.pricing) return
        setPricing(data.pricing)
      })
      .catch(() => {
        // Pricing endpoint unreachable (env not configured) — keep fallback.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return pricing
}

export function computeRoyalty(
  pricing: PricingMap,
  toolName: string,
  args: unknown,
  kind: "dataset" | "api",
): number {
  // Per-call price from the tool name
  const perCall = pricing[toolName] ?? (kind === "api" ? FALLBACK_API : 0)

  // Per-hit dataset prices keyed by numeric id in args.dataset_ids / args.id
  let datasetEur = 0
  if (kind === "dataset" && args && typeof args === "object") {
    const a = args as Record<string, unknown>
    const ids = (a.dataset_ids as number[] | undefined) ?? extractIdFromEntry(a.id)
    for (const id of ids ?? []) {
      datasetEur += pricing[`dataset:${id}`] ?? FALLBACK_DATASET
    }
    if ((ids?.length ?? 0) === 0) {
      // Unknown dataset — still attribute something so the ripple lands.
      datasetEur = FALLBACK_DATASET
    }
  }

  return +(perCall + datasetEur).toFixed(4)
}

function extractIdFromEntry(id: unknown): number[] | null {
  if (typeof id !== "string") return null
  const m = id.match(/^(?:[a-z]+-)?(\d+)/i)
  if (!m) return null
  return [Number(m[1])]
}
