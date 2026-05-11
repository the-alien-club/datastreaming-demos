"use client"

// Client-side TanStack Query hooks for MCP server CRUD operations.
//
// All hooks use `apiFetch` from `@/lib/api-fetch` so the basePath is
// applied correctly when the app is mounted at a sub-path.
//
// Query key factory `mcpKeys` is exported so consumers can invalidate
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
  createMcpBodySchema,
  updateMcpBodySchema,
} from "@/app/api/_validators"
import type { z } from "zod"
import { apiFetch } from "@/lib/api-fetch"
import type { McpWithOwnership } from "@/models/mcps/queries"
import type { AvailableMcp, AvailableMcpsResponse } from "@/app/api/_validators"

// ── Types inferred from validators ────────────────────────────────────────

export type CreateMcpBody = z.infer<typeof createMcpBodySchema>
export type UpdateMcpBody = z.infer<typeof updateMcpBodySchema>

export type { AvailableMcp, AvailableMcpsResponse }

// ── Query key factory ──────────────────────────────────────────────────────

export const mcpKeys = {
  all: ["mcps"] as const,
  lists: () => [...mcpKeys.all, "list"] as const,
  available: () => [...mcpKeys.all, "available"] as const,
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

/** Fetch all MCP servers (own + public) for the authenticated user. */
export function useMcps(): UseQueryResult<McpWithOwnership[]> {
  return useQuery({
    queryKey: mcpKeys.lists(),
    queryFn: () => fetchJson<McpWithOwnership[]>("/api/mcps"),
  })
}

/**
 * Fetch the curated list of available (enabled) MCPs split by source.
 * Used by the wizard and agent-edit form to populate MCP pickers.
 */
export function useAvailableMcps(): UseQueryResult<AvailableMcpsResponse> {
  return useQuery({
    queryKey: mcpKeys.available(),
    queryFn: () => fetchJson<AvailableMcpsResponse>("/api/mcps/available"),
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Create a new MCP server. Invalidates the MCP list on success. */
export function useCreateMcp(): UseMutationResult<McpWithOwnership, Error, CreateMcpBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMcpBody) =>
      fetchJson<McpWithOwnership>("/api/mcps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all })
    },
  })
}

/** Update an MCP server. Invalidates the full MCP cache on success. */
export function useUpdateMcp(id: string): UseMutationResult<McpWithOwnership, Error, UpdateMcpBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateMcpBody) =>
      fetchJson<McpWithOwnership>(`/api/mcps/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all })
    },
  })
}

/** Delete an MCP server by ID. Invalidates the full MCP cache on success. */
export function useDeleteMcp(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/mcps/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all })
    },
  })
}
