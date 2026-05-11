import type { UIDataTypes, UIMessagePart, UITools } from "ai"
import { Prisma } from "@/lib/generated/prisma/client"

// Persisted shape of the assistant's `UIMessage.parts`. Accepts every data
// part type emitted by `responses_stream.ts` (`data-toolCall`,
// `data-subagent`, …) — the chat UI ignores unknown part types so we
// don't need a tighter compile-time bound here.
export type StoredMessagePart = UIMessagePart<UIDataTypes, UITools>

// ── Query shapes ───────────────────────────────────────────────────────────────
//
// Prisma v7 no longer ships `Prisma.validator` in the generated client.
// `satisfies` achieves the same goal: the object literal is constrained to a
// valid `ConversationDefaultArgs` shape, literal types are preserved, and
// `ConversationGetPayload<typeof shape>` derives an accurate TypeScript type.

// Plain conversation row. Used by policies and any operation that needs only
// scalar conversation fields (userId, agentId, sessionId, title).
export const conversationRow = {
  select: {
    id: true,
    agentId: true,
    userId: true,
    sessionId: true,
    title: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.ConversationDefaultArgs
export type ConversationSelect = Prisma.ConversationGetPayload<typeof conversationRow>

// Conversation with its messages ordered by creation time. Used by the chat
// route to load the full thread.
export const conversationWithMessages = {
  include: { messages: { orderBy: { createdAt: "asc" } } },
} satisfies Prisma.ConversationDefaultArgs
export type ConversationWithMessages = Prisma.ConversationGetPayload<typeof conversationWithMessages>

// Plain message row. Used as the canonical type for persisted messages.
export const messageRow = {
  select: {
    id: true,
    conversationId: true,
    role: true,
    content: true,
    parts: true,
    metadata: true,
    createdAt: true,
  },
} satisfies Prisma.MessageDefaultArgs
export type MessageSelect = Prisma.MessageGetPayload<typeof messageRow>

// ── Insert shapes ──────────────────────────────────────────────────────────────
// These are input types for write operations, not query return shapes. They are
// intentionally hand-written: the application passes a controlled subset of
// fields and Prisma handles defaults server-side.

export type ConversationInsert = {
  id: string
  agentId: string
  userId: string
  sessionId?: string | null
  title?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type MessageInsert = {
  id: string
  conversationId: string
  role: string
  content: string
  parts?: StoredMessagePart[] | null
  metadata?: string | null
  createdAt?: Date
}
