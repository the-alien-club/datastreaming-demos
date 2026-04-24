import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

export const mcps = pgTable("mcps", {
  id: text("id").primaryKey(), // uuid or slug (e.g. 'datacluster')
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  transport: text("transport").default("streamable_http"),
  authToken: text("auth_token"),
  description: text("description"),
  category: text("category"), // e.g. 'data', 'research', 'legal'
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const specialists = pgTable("specialists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("mistral-small-latest"),
  mcpIds: text("mcp_ids"),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const agents = pgTable("agents", {
  id: text("id").primaryKey(), // uuid
  workflowId: integer("workflow_id"), // platform backend workflow ID (null if creation pending/failed)
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt"), // overall system prompt
  steps: text("steps"), // JSON array of {name, prompt} objects
  model: text("model").default("mistral-small-latest"),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const agentSubagents = pgTable("agent_subagents", {
  id: text("id").primaryKey(), // uuid
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // display name / description for the deep agent
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("mistral-small-latest"),
  mcpIds: text("mcp_ids"), // JSON array of MCP config IDs from static file
  datasetId: text("dataset_id"), // if corpus-based, the dataset ID to inject
  nodeId: text("node_id"), // the subagent node ID in the workflow graph
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(), // uuid
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id"), // better-auth user id; null for legacy rows
  sessionId: text("session_id"), // platform session_id for multi-turn
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const messages = pgTable("messages", {
  id: text("id").primaryKey(), // uuid
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON: {model, tokens, cost, tool_calls, agent_context}
  createdAt: timestamp("created_at", { withTimezone: false }).$defaultFn(() => new Date()),
})

export const datasets = pgTable("datasets", {
  id: text("id").primaryKey(), // uuid
  clusterDatasetId: integer("cluster_dataset_id"), // data cluster dataset ID
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("pending"), // pending | processing | ready | error
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
