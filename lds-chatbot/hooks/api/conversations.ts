"use client"

// Client-side TanStack Query hooks for conversation operations.
//
// All hooks use `apiFetch` from `@/lib/api-fetch` so the basePath is
// applied correctly when the app is mounted at a sub-path.
//
// Query key factory `conversationKeys` is exported so consumers can
// invalidate specific slices (e.g. after deleting a conversation from a
// detail page) without coupling themselves to the key shape.
//
// Conversations are read-only from the client's perspective — they are
// created implicitly by the chat endpoint. The only mutation exposed here
// is delete.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-fetch"
import type { ConversationSummary, ConversationByAgentSummary } from "@/models/conversations/service"

// ── Query key factory ──────────────────────────────────────────────────────

export const conversationKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationKeys.all, "list"] as const,
  byAgent: (agentId: string) => [...conversationKeys.all, "byAgent", agentId] as const,
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

/** Fetch all conversations for the authenticated user, most-recently-updated first. */
export function useConversations(): UseQueryResult<ConversationSummary[]> {
  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: () => fetchJson<ConversationSummary[]>("/api/conversations"),
  })
}

/**
 * Fetch conversations scoped to a single agent for the authenticated user.
 * Used by the agent detail page to render the per-assistant history panel.
 */
export function useConversationsByAgent(agentId: string): UseQueryResult<ConversationByAgentSummary[]> {
  return useQuery({
    queryKey: conversationKeys.byAgent(agentId),
    queryFn: () =>
      fetchJson<ConversationByAgentSummary[]>(`/api/agents/${agentId}/conversations`),
    enabled: agentId.length > 0,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Delete a conversation by ID.
 * Invalidates the full conversation cache so both the list and any
 * per-agent views refresh on the next mount.
 */
export function useDeleteConversation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/conversations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    },
  })
}
