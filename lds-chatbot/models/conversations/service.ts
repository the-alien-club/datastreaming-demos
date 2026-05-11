import "server-only"

import { getAgentNamesByIds } from "@/models/agents/queries"
import {
  getConversation,
  getConversationRows,
  getConversationRowsByAgent,
  deleteConversationRecord,
} from "./queries"
import type { ConversationSelect } from "./schema"

// ─── Cross-model read projections ─────────────────────────────────────────────
//
// ConversationSummary and ConversationByAgentSummary include agent names, which
// require cross-model data. service.ts fetches the raw rows from queries.ts,
// then resolves agent names via models/agents/queries.ts and merges the two
// result sets in application code — keeping queries.ts free of cross-model
// imports.

export type ConversationSummary = {
  id: string
  agentId: string
  agentName: string | null
  title: string | null
  sessionId: string | null
  createdAt: Date | null
  updatedAt: Date | null
  messageCount: number
}

export type ConversationByAgentSummary = {
  id: string
  agentId: string
  agentName: string | null
  title: string | null
  updatedAt: Date | null
  messageCount: number
}

/**
 * Returns all conversations owned by `userId`, most-recently-updated first,
 * with agent name and message count.
 */
export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await getConversationRows(userId)
  if (rows.length === 0) return []

  const uniqueAgentIds = [...new Set(rows.map((r) => r.agentId))]
  const agentNames = await getAgentNamesByIds(uniqueAgentIds)

  return rows.map((r) => ({
    ...r,
    agentName: agentNames[r.agentId] ?? null,
  }))
}

/**
 * Returns all conversations scoped to a single agent for `userId`, most-
 * recently-updated first, with message counts. Returns an empty array (not
 * an error) when the agent has no conversations yet.
 */
export async function getConversationsByAgent(
  agentId: string,
  userId: string,
): Promise<ConversationByAgentSummary[]> {
  const rows = await getConversationRowsByAgent(agentId, userId)
  if (rows.length === 0) return []

  const agentNames = await getAgentNamesByIds([agentId])
  const agentName = agentNames[agentId] ?? null

  return rows.map((r) => ({
    ...r,
    agentName,
  }))
}

// ── Delete ─────────────────────────────────────────────────────────────────

/**
 * Deletes a conversation owned by `userId`. Verifies ownership before
 * deleting so the caller can rely on a `ConversationPolicy.delete()` check
 * having already passed — or use this function as the policy enforcement
 * point when loading and deleting are done together.
 *
 * Messages cascade-delete via FK constraint.
 *
 * @throws If the conversation does not exist or is not owned by `userId`.
 */
export async function deleteConversation(id: string, userId: string): Promise<void> {
  const existing = await getConversation(id, userId)
  if (!existing) throw new Error(`Conversation ${id} not found`)
  await deleteConversationRecord(id)
}

/**
 * Loads a conversation by (id, userId). Returns `undefined` if not found.
 * Thin wrapper so route handlers do not import from queries directly when
 * they only need the ownership-scoped load.
 */
export async function getOwnedConversation(
  id: string,
  userId: string,
): Promise<(ConversationSelect & { messages: import("./schema").MessageSelect[] }) | undefined> {
  return getConversation(id, userId)
}
