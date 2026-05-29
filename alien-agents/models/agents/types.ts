import { z } from "zod"
import type { AgentRow as AgentSelect, AgentSubagentRow as AgentSubagentSelect } from "./schema"

const ID = z.string().trim().min(1, "must be non-empty")
const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")
const LONG_TEXT = z.string().max(128_000, "max 128000 chars")
const STARTER_PROMPT = z.string().trim().min(1).max(500)

// ── Steps & subagents ──────────────────────────────────────────────────────

export const stepSchema = z.object({
  name: NAME,
  prompt: z.string().trim().min(1, "prompt is required").max(16_000),
})
export type StepData = z.infer<typeof stepSchema>

export const subagentConfigSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(LONG_TEXT.maxLength ?? 128_000),
  model: z.string().trim().min(1).max(120),
  mcpIds: z.array(ID).default([]),
  // `datasetId` is preserved end-to-end so corpus attachments survive a
  // round-trip save (see C-3 in REVIEW_SUMMARY).
  datasetId: ID.nullable().optional(),
})
export type SubagentConfigData = z.infer<typeof subagentConfigSchema>

// ── Create agent ───────────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  // systemPrompt is required at creation per UX requirement: an assistant
  // without a system prompt has no defined behaviour.
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(128_000),
  author: z.string().trim().max(120).nullable().optional(),
  steps: z.array(stepSchema).default([]),
  model: z.string().trim().min(1).max(120).optional(),
  subagents: z.array(subagentConfigSchema).default([]),
  starterPrompts: z.array(STARTER_PROMPT).optional(),
})
export type CreateAgentData = z.infer<typeof createAgentSchema>

// ── Update agent ───────────────────────────────────────────────────────────
//
// PUT is full-replace: the request body must carry the complete agent
// shape. Required fields stay required; optional metadata stays optional.
//
// Why no defensive coercion (no `string | array` unions, no fallback to
// existing DB state for missing arrays):
//   - A client that ships `steps: "[]"` (string) has a bug; silently
//     coercing to `[]` masks it. Reject with 400 so the bug surfaces.
//   - A client that omits `subagents` from a PUT and previously had a
//     populated subagent list will, under "PUT means full-replace",
//     wipe them. Requiring the field forces the client to be explicit
//     ("yes, I want zero subagents" → `subagents: []`; "I want to keep
//     them" → echo them back).
//
// `description` and `starterPrompts` remain optional because the
// existing edit form does not always include them in the payload.

export const updateAgentSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.nullable().optional(),
  author: z.string().trim().max(120).nullable().optional(),
  // ISO date string (YYYY-MM-DD) sent from the date picker. The route
  // handler converts it to a Date before writing to Postgres.
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
  systemPrompt: LONG_TEXT,
  steps: z.array(stepSchema),
  starterPrompts: z.array(STARTER_PROMPT).optional(),
  model: z.string().trim().min(1).max(120),
  subagents: z.array(subagentConfigSchema),
  isForkable: z.boolean().default(false),
})
export type UpdateAgentData = z.infer<typeof updateAgentSchema>

// ── Subagent create / delete ───────────────────────────────────────────────

export const subagentCreateSchema = subagentConfigSchema
export type SubagentCreateData = z.infer<typeof subagentCreateSchema>

export const subagentDeleteSchema = z.object({
  subagentId: ID,
})
export type SubagentDeleteData = z.infer<typeof subagentDeleteSchema>

// ── Visibility patch ───────────────────────────────────────────────────────

// Narrow schema for the PATCH /api/agents/[id] visibility endpoint.
export const patchAgentVisibilitySchema = z.object({
  isPublic: z.boolean(),
})
export type PatchAgentVisibilityData = z.infer<typeof patchAgentVisibilitySchema>

// ── Response types ─────────────────────────────────────────────────────────
//
// Derived from $inferSelect aliases in schema.ts — never written by hand.

export type AgentRow = AgentSelect
export type SubagentRow = AgentSubagentSelect

// Full agent shape (owner view) with the subagents relation and isOwn flag.
export type AgentResponse = AgentRow & {
  subagents: SubagentRow[]
  isOwn?: boolean
  // starterPrompts is returned as a parsed array by every handler that
  // touches the field (stored as JSON string in the DB).
  starterPrompts: string[]
}

// Public (non-owner) view — only chat-relevant fields, no internals.
export type AgentPublicResponse = {
  id: string
  name: string
  description: string | null
  model: string | null
  isPublic: boolean
  starterPrompts: string[]
}

export type AgentListResponse = AgentResponse[]

// ── Fork ───────────────────────────────────────────────────────────────────

export const forkAgentSchema = z.object({
  nameSuffix: z.string().max(60),
})
export type ForkAgentBody = z.infer<typeof forkAgentSchema>

export type ForkAgentResponse = {
  id: string
  name: string
}

// ── Agent conversations list ────────────────────────────────────────────────

export type AgentConversationListItem = {
  id: string
  agentId: string
  agentName: string | null
  title: string | null
  updatedAt: number | null
  messageCount: number
}

// ── Subagents ──────────────────────────────────────────────────────────────

export type SubagentResponse = SubagentRow
