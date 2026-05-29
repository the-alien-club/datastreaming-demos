"use client"

// Client-side TanStack Query hooks for dataset CRUD operations.
//
// All hooks use `apiFetch` from `@/lib/api-fetch` so the basePath is
// applied correctly when the app is mounted at a sub-path.
//
// Query key factory `datasetKeys` is exported so consumers can invalidate
// specific slices (e.g. after a mutation from a different page) without
// coupling themselves to the key shape.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type {
  createDatasetBodySchema,
  updateDatasetBodySchema,
} from "@/app/api/_validators"
import type { z } from "zod"
import { apiFetch } from "@/lib/api-fetch"
import type { DatasetSummary, DatasetDetail } from "@/models/datasets/service"

// ── Types inferred from validators ────────────────────────────────────────

export type CreateDatasetBody = z.infer<typeof createDatasetBodySchema>
export type UpdateDatasetBody = z.infer<typeof updateDatasetBodySchema>

// ── Query key factory ──────────────────────────────────────────────────────

export const datasetKeys = {
  all: ["datasets"] as const,
  lists: () => [...datasetKeys.all, "list"] as const,
  detail: (id: string) => [...datasetKeys.all, "detail", id] as const,
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

/** Fetch all datasets (own + public) for the authenticated user. */
export function useDatasets(): UseQueryResult<DatasetSummary[]> {
  return useQuery({
    queryKey: datasetKeys.lists(),
    queryFn: () => fetchJson<DatasetSummary[]>("/api/datasets"),
  })
}

/** Fetch a single dataset by ID, including its attached agents. */
export function useDataset(id: string): UseQueryResult<DatasetDetail> {
  return useQuery({
    queryKey: datasetKeys.detail(id),
    queryFn: () => fetchJson<DatasetDetail>(`/api/datasets/${id}`),
    enabled: id.length > 0,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Create a new dataset. Invalidates the dataset list on success. */
export function useCreateDataset(): UseMutationResult<DatasetSummary, Error, CreateDatasetBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDatasetBody) =>
      fetchJson<DatasetSummary>("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all })
    },
  })
}

/** Delete a dataset by ID. Invalidates the dataset list on success. */
export function useDeleteDataset(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all })
    },
  })
}

/** Partially update a dataset. Invalidates both the list and the detail on success. */
export function useUpdateDataset(id: string): UseMutationResult<DatasetSummary, Error, UpdateDatasetBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateDatasetBody) =>
      fetchJson<DatasetSummary>(`/api/datasets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: datasetKeys.all })
    },
  })
}
