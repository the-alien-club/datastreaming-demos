"use client"

// Client-side TanStack Query hook for the AI model catalogue.
//
// `GET /api/models` proxies to the platform backend, applies a server-side
// TTL cache (1 hour), and filters to LLM models only. The client cache uses
// a 5-minute staleTime since the catalogue changes infrequently — this avoids
// hammering the proxy on every component mount while still picking up new
// models within a reasonable window.
//
// This hook replaces the five components that previously fetched the model
// list inline with their own `useEffect` + `useState` patterns.

import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { PublicAIModel } from "@/lib/platform/client"
import { apiFetch } from "@/lib/api-fetch"

// ── Query key factory ──────────────────────────────────────────────────────

export const modelKeys = {
  all: ["models"] as const,
  lists: () => [...modelKeys.all, "list"] as const,
}

// ── Helper ─────────────────────────────────────────────────────────────────

async function fetchModels(): Promise<PublicAIModel[]> {
  const res = await apiFetch("/api/models")
  if (!res.ok) {
    let message = `Failed to load models: ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.error === "string") message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  return res.json() as Promise<PublicAIModel[]>
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns the list of available LLM models from the platform catalogue.
 *
 * Data is considered fresh for 5 minutes — a balance between avoiding
 * excessive requests and picking up newly added models promptly.
 */
export function useModels(): UseQueryResult<PublicAIModel[]> {
  return useQuery({
    queryKey: modelKeys.lists(),
    queryFn: fetchModels,
    staleTime: 5 * 60_000,
  })
}
