import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import type { UIDataTypes, UIMessagePart, UITools } from "ai"

// Persisted shape of the assistant's `UIMessage.parts`. Accepts every data
// part type emitted by `responses_stream.ts` (`data-toolCall`,
// `data-subagent`, …) — the chat UI ignores unknown part types so we
// don't need a tighter compile-time bound here.
export type StoredMessagePart = UIMessagePart<UIDataTypes, UITools>

export const mcps = pgTable("mcps", {
  id: text("id").primaryKey(), // uuid or slug (e.g. 'datacluster')
  userId: text("user_id").notNull(), // better-auth user id; FK enforced by migration ON DELETE CASCADE
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  transport: text("transport").default("streamable_http"),
  authToken: text("auth_token"),
  description: text("description"),
  category: text("category"), // e.g. 'data', 'research', 'legal'
  enabled: boolean("enabled").default(true),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const specialists = pgTable("specialists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // better-auth user id; FK enforced by migration ON DELETE CASCADE
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("mistral-large-2512"),
  mcpIds: text("mcp_ids"),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const agents = pgTable("agents", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // better-auth user id; FK enforced by migration ON DELETE CASCADE
  workflowId: integer("workflow_id"), // platform backend workflow ID (null if creation pending/failed)
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt"), // overall system prompt
  steps: text("steps"), // JSON array of {name, prompt} objects
  starterPrompts: text("starter_prompts"), // JSON array of strings — chip-style suggestions for empty conversations
  model: text("model").default("mistral-large-2512"),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const agentSubagents = pgTable("agent_subagents", {
  id: text("id").primaryKey(), // uuid
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // display name / description for the deep agent
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("mistral-large-2512"),
  mcpIds: text("mcp_ids"), // JSON array of MCP config IDs from static file
  // FK to datasets.id with ON DELETE SET NULL — preserves the subagent row
  // when its dataset is deleted; the corpus link silently breaks but the
  // workflow keeps running so a user can re-attach a different dataset.
  datasetId: text("dataset_id").references(() => datasets.id, { onDelete: "set null" }),
  // Workflow graph node ID (e.g. "subagent-6"). Written by buildAgentWorkflow
  // and kept in sync on every workflow rebuild so the stream translator can
  // map node IDs back to human-readable names.
  nodeId: text("node_id"),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(), // uuid
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), // better-auth user id; FK enforced by migration ON DELETE CASCADE
  sessionId: text("session_id"), // platform session_id for multi-turn
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const messages = pgTable("messages", {
  id: text("id").primaryKey(), // uuid
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  // Plain-text view of the reply, kept for backward compat and for the
  // OpenAI-compat path that doesn't carry structured parts.
  content: text("content").notNull(),
  // Full AI-SDK `UIMessage.parts` array as emitted during streaming —
  // text bubbles, tool-call data parts, subagent panels, etc. Lets the
  // UI replay the rich rendering on a refresh instead of collapsing to
  // plain text. NULL for legacy rows written before this column existed.
  parts: jsonb("parts").$type<StoredMessagePart[]>(),
  metadata: text("metadata"), // JSON: {model, tokens, cost, tool_calls, agent_context}
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const datasets = pgTable("datasets", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id").notNull(), // better-auth user id; FK enforced by migration ON DELETE CASCADE
  clusterDatasetId: integer("cluster_dataset_id"), // data cluster dataset ID
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("pending"), // pending | processing | ready | error
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

// Relations for query builder
export const agentsRelations = relations(agents, ({ many }) => ({
  subagents: many(agentSubagents),
  conversations: many(conversations),
}))

export const agentSubagentsRelations = relations(agentSubagents, ({ one }) => ({
  agent: one(agents, { fields: [agentSubagents.agentId], references: [agents.id] }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}))

export const datasetsRelations = relations(datasets, () => ({}))

export const specialistsRelations = relations(specialists, () => ({}))
