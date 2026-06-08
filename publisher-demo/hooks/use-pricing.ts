"use client"

import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import type { DemoPricingResponse, PricingMap } from "@/lib/platform/types"

const PRICING_KEY = ["demo", "pricing"] as const

async function fetchPricing(): Promise<DemoPricingResponse> {
  const res = await fetch("/api/demo/pricing", { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`pricing ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as DemoPricingResponse
}

export interface UsePricingResult {
  pricing: PricingMap
  isLoading: boolean
  isError: boolean
  /** Compute € for a single tool call given the args. */
  computeRoyalty: (
    toolName: string,
    args: Record<string, unknown> | null,
    kind: "dataset" | "api",
  ) => { royaltyEur: number; datasetIds: number[] }
}

/**
 * `usePricing()` returns the live pricing map (loaded once at app start) plus
 * a `computeRoyalty` helper. Royalty for a dataset call is the sum of every
 * `dataset:<id>` entry whose ID appears in `args.dataset_ids`. Royalty for an
 * API call is the `<tool_name>` entry. Returns `{ royaltyEur: 0, datasetIds: [] }`
 * when nothing matches — callers can fall back to design defaults if they
 * want a non-zero ripple for unknown tools.
 */
export function usePricing(): UsePricingResult {
  const query = useQuery({
    queryKey: PRICING_KEY,
    queryFn: fetchPricing,
    staleTime: 30 * 60 * 1000,
  })

  const pricing = query.data?.pricing ?? {}

  const computeRoyalty = useCallback(
    (
      toolName: string,
      args: Record<string, unknown> | null,
      kind: "dataset" | "api",
    ): { royaltyEur: number; datasetIds: number[] } => {
      if (kind === "api") {
        const eur = pricing[toolName] ?? 0
        return { royaltyEur: round4(eur), datasetIds: [] }
      }
      const ids = extractDatasetIds(args)
      let eur = 0
      for (const id of ids) {
        eur += pricing[`dataset:${id}`] ?? 0
      }
      return { royaltyEur: round4(eur), datasetIds: ids }
    },
    [pricing],
  )

  return {
    pricing,
    isLoading: query.isLoading,
    isError: query.isError,
    computeRoyalty,
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Tool calls that hit a datacluster carry the touched dataset IDs in their
 * args under one of a few common shapes. We handle:
 *   - `dataset_ids: number[]`
 *   - `dataset_id: number`
 *   - `datasetId: number`
 *   - `id: number` when the tool is `datacluster_get_*` (single-record fetch)
 */
function extractDatasetIds(args: Record<string, unknown> | null): number[] {
  if (!args) return []
  const out: number[] = []
  const raw =
    (args.dataset_ids as unknown) ?? (args.datasetIds as unknown) ?? undefined
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) out.push(n)
    }
  }
  const singular = args.dataset_id ?? args.datasetId
  if (singular !== undefined) {
    const n = Number(singular)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  // dedupe
  return Array.from(new Set(out))
}
