"use client"

// Client-side TanStack Query hooks for agent CRUD operations.
//
// All hooks use `apiFetch` from `@/lib/api-fetch` so the basePath is
// applied correctly when the app is mounted at a sub-path.
//
// Query key factory `agentKeys` is exported so consumers can invalidate
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
  createAgentBodySchema,
  updateAgentBodySchema,
  AgentResponse,
  ForkAgentResponse,
} from "@/app/api/_validators"
import type { z } from "zod"
import { apiFetch } from "@/lib/api-fetch"

// ── Types inferred from validators ────────────────────────────────────────

export type CreateAgentBody = z.infer<typeof createAgentBodySchema>
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>
export type { AgentResponse }

// ── Query key factory ──────────────────────────────────────────────────────

export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  detail: (id: string) => [...agentKeys.all, "detail", id] as const,
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

/** Fetch all agents (own + public) for the authenticated user. */
export function useAgents(): UseQueryResult<AgentResponse[]> {
  return useQuery({
    queryKey: agentKeys.lists(),
    queryFn: () => fetchJson<AgentResponse[]>("/api/agents"),
  })
}

/** Fetch a single agent by ID. */
export function useAgent(id: string): UseQueryResult<AgentResponse> {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => fetchJson<AgentResponse>(`/api/agents/${id}`),
    enabled: id.length > 0,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Create a new agent. Invalidates the agent list on success. */
export function useCreateAgent(): UseMutationResult<AgentResponse, Error, CreateAgentBody> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAgentBody) =>
      fetchJson<AgentResponse>("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

/** Delete an agent by ID. Invalidates the agent list on success. */
export function useDeleteAgent(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

/** Fork a public agent into the caller's workspace. Invalidates the agent list on success. */
export function useForkAgent(): UseMutationResult<ForkAgentResponse, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<ForkAgentResponse>(`/api/agents/${id}/fork`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}
