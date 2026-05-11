"use client"

// Client-side TanStack Query hooks for specialist CRUD operations.
//
// All hooks use `apiFetch` from `@/lib/api-fetch` so the basePath is
// applied correctly when the app is mounted at a sub-path.
//
// Query key factory `specialistKeys` is exported so consumers can invalidate
// specific slices (e.g. after a mutation from a different page) without
// coupling themselves to the key shape.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type { specialistBodySchema } from "@/app/api/_validators"
import type { z } from "zod"
import { apiFetch } from "@/lib/api-fetch"
import type { SpecialistWithOwnership } from "@/models/specialists/queries"

// ── Types inferred from validators ────────────────────────────────────────

export type SpecialistBody = z.infer<typeof specialistBodySchema>

// ── Query key factory ──────────────────────────────────────────────────────

export const specialistKeys = {
  all: ["specialists"] as const,
  lists: () => [...specialistKeys.all, "list"] as const,
  detail: (id: string) => [...specialistKeys.all, "detail", id] as const,
}

// ── Helper ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    let message = `Request failed: ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.error === "string") message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Fetch all specialists (own + public) for the authenticated user. */
export function useSpecialists(): UseQueryResult<SpecialistWithOwnership[]> {
  return useQuery({
    queryKey: specialistKeys.lists(),
    queryFn: () => fetchJson<SpecialistWithOwnership[]>("/api/specialists"),
  })
}

/** Fetch a single specialist by ID. */
export function useSpecialist(id: string): UseQueryResult<SpecialistWithOwnership> {
  return useQuery({
    queryKey: specialistKeys.detail(id),
    queryFn: () => fetchJson<SpecialistWithOwnership>(`/api/specialists/${id}`),
    enabled: id.length > 0,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Create a new specialist. Invalidates the specialist list on success. */
export function useCreateSpecialist(): UseMutationResult<SpecialistWithOwnership, Error, SpecialistBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SpecialistBody) =>
      fetchJson<SpecialistWithOwnership>("/api/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specialistKeys.all })
    },
  })
}

/** Delete a specialist by ID. Invalidates the specialist list on success. */
export function useDeleteSpecialist(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/specialists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specialistKeys.all })
    },
  })
}

/** Full-replace update a specialist. Invalidates both the list and the detail on success. */
export function useUpdateSpecialist(id: string): UseMutationResult<SpecialistWithOwnership, Error, SpecialistBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SpecialistBody) =>
      fetchJson<SpecialistWithOwnership>(`/api/specialists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specialistKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: specialistKeys.all })
    },
  })
}
