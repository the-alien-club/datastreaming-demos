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
} from "@/app/api/_validators"
import type { z } from "zod"
import { apiFetch } from "@/lib/api-fetch"

// ── Types inferred from validators ────────────────────────────────────────

export type CreateAgentBody = z.infer<typeof createAgentBodySchema>
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>

// The API returns `ok(agent)` which is a plain JSON body — no envelope.
// We use `unknown` here and cast at the call-site boundary; a shared
// `AgentResponse` type can be introduced once there's a stable API
// response type package.
export type AgentResponse = {
  id: string
  userId: string
  workflowId: number | null
  name: string
  description: string | null
  systemPrompt: string | null
  steps: string | null
  starterPrompts: string[]
  model: string | null
  author: string | null
  isPublic: boolean
  isOwn?: boolean
  createdAt: string
  updatedAt: string
  subagents: {
    id: string
    agentId: string
    name: string
    systemPrompt: string
    model: string | null
    mcpIds: string | null
    datasetId: string | null
    nodeId: string | null
    createdAt: string
  }[]
}

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
