import "server-only"

import { prisma } from "@/lib/db"
import {
  conversationRow,
  conversationWithMessages,
  messageRow,
  type ConversationSelect,
  type ConversationWithMessages,
  type MessageSelect,
  type ConversationInsert,
  type MessageInsert,
} from "./schema"

// ─── List projection types ────────────────────────────────────────────────────

// ConversationRow is the single-model projection returned by `getConversationRows`
// and `getConversationRowsByAgent`. It omits agent name — cross-model enrichment
// (joining the agents table for the name) is the responsibility of service.ts,
// which is allowed to call both conversations/queries and agents/queries.

export type ConversationRow = {
  id: string
  agentId: string
  title: string | null
  sessionId: string | null
  createdAt: Date | null
  updatedAt: Date | null
  messageCount: number
}

export type ConversationByAgentRow = {
  id: string
  agentId: string
  title: string | null
  updatedAt: Date | null
  messageCount: number
}

/**
 * Returns raw conversation rows owned by `userId`, most-recently-updated first,
 * with message count. Does not join agents — agent names are resolved by
 * `service.ts` via `models/agents/queries.ts`.
 */
export async function getConversationRows(userId: string): Promise<ConversationRow[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  })

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    title: r.title,
    sessionId: r.sessionId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    messageCount: r._count.messages,
  }))
}

/**
 * Returns raw conversation rows scoped to a single agent for `userId`,
 * most-recently-updated first, with message count. Does not join agents —
 * the agent name is resolved by `service.ts` via `models/agents/queries.ts`.
 */
export async function getConversationRowsByAgent(
  agentId: string,
  userId: string,
): Promise<ConversationByAgentRow[]> {
  const rows = await prisma.conversation.findMany({
    where: { agentId, userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  })

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    title: r.title,
    updatedAt: r.updatedAt,
    messageCount: r._count.messages,
  }))
}

/**
 * Returns a single conversation (with messages ordered by creation time) that
 * belongs to `userId`. Returns `undefined` when no matching row exists.
 *
 * @deprecated Prefer `getConversationById` + `ConversationPolicy` for ownership
 * enforcement. This function bakes the ownership check into the query, making
 * the policy a no-op for callers that use it.
 */
export async function getConversation(
  id: string,
  userId: string,
): Promise<ConversationWithMessages | undefined> {
  const row = await prisma.conversation.findFirst({
    where: { id, userId },
    ...conversationWithMessages,
  })
  return row ?? undefined
}

/**
 * Returns a single conversation (with messages ordered by creation time) by ID,
 * without filtering by owner. The caller is responsible for enforcing ownership
 * via `ConversationPolicy` before returning data to the requesting user.
 *
 * Returns `undefined` when no matching row exists.
 */
export async function getConversationById(
  id: string,
): Promise<ConversationWithMessages | undefined> {
  const row = await prisma.conversation.findUnique({
    where: { id },
    ...conversationWithMessages,
  })
  return row ?? undefined
}

/**
 * Inserts a new conversation row and returns the inserted record.
 */
export async function insertConversation(values: ConversationInsert): Promise<ConversationSelect> {
  return prisma.conversation.create({
    data: values,
    ...conversationRow,
  })
}

/**
 * Updates a conversation row and returns the updated record.
 */
export async function updateConversationRecord(
  id: string,
  values: Partial<ConversationInsert>,
): Promise<ConversationSelect> {
  const row = await prisma.conversation.update({
    where: { id },
    data: values,
    ...conversationRow,
  })
  if (!row) throw new Error(`Conversation ${id} not found after update`)
  return row
}

/**
 * Deletes a conversation row. Messages cascade-delete via FK constraint.
 */
export async function deleteConversationRecord(id: string): Promise<void> {
  await prisma.conversation.delete({ where: { id } })
}

/**
 * Inserts a new message row and returns the inserted record.
 */
export async function insertMessage(values: MessageInsert): Promise<MessageSelect> {
  // Prisma types `parts` as `Json?` while MessageInsert carries the richer
  // `StoredMessagePart[] | null` type. The cast is safe: the runtime data is
  // identical and the DB column stores arbitrary JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.message.create({
    data: { ...values, parts: values.parts as any },
    ...messageRow,
  })
}

/**
 * Returns all messages for a conversation, ordered by creation time.
 */
export async function getMessages(conversationId: string): Promise<MessageSelect[]> {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    ...messageRow,
  })
}
