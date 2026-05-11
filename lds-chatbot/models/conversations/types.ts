import { z } from "zod"
import type { ConversationSelect, MessageSelect } from "./schema"

const ID = z.string().trim().min(1, "must be non-empty")

// ── Chat request ───────────────────────────────────────────────────────────

// Schema for POST /api/chat request bodies.
// The client sends the last UI message (parts or content string) plus the IDs
// that identify which agent / conversation to route the turn to.
export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        parts: z
          .array(z.object({ type: z.string(), text: z.string().optional() }))
          .optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  agentId: ID,
  conversationId: ID.optional(),
})
export type ChatRequestBody = z.infer<typeof chatSchema>

// Schema for POST /api/chat/cancel.
export const cancelSchema = z.object({
  agentId: ID,
  responseId: ID,
})
export type CancelData = z.infer<typeof cancelSchema>

// Schema for POST /api/chat/resume.
// `startingAfter` is a non-negative integer sequence number; no upper bound
// is necessary because the platform will reject out-of-range values.
export const resumeSchema = z.object({
  conversationId: ID,
  responseId: ID,
  startingAfter: z.number().int().nonnegative(),
})
export type ResumeData = z.infer<typeof resumeSchema>

// ── Response types ─────────────────────────────────────────────────────────

export type ConversationRow = ConversationSelect
export type MessageRow = MessageSelect

export type ConversationListItem = {
  id: string
  agentId: string
  agentName: string | null
  title: string | null
  sessionId: string | null
  createdAt: Date | null
  updatedAt: Date | null
  messageCount: number
}

export type ConversationDetailResponse = ConversationRow & {
  messages: MessageRow[]
}

export type CancelResponse = { cancelled: boolean }
