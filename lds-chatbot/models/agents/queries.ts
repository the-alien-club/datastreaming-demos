import "server-only"

import { prisma } from "@/lib/db"
import {
  agentWithSubagents,
  agentCardData,
  agentSubagentRow,
  type AgentWithSubagents,
  type AgentCardData,
  type AgentSubagentRow,
} from "./schema"

// ── Insert / update input types ────────────────────────────────────────────────
// Hand-written input types for write operations — not query return shapes.
// Callers pass a controlled subset of fields; Prisma handles defaults.

export type AgentInsert = {
  id: string
  userId: string
  workflowId?: number | null
  name: string
  description?: string | null
  systemPrompt?: string | null
  steps?: string | null
  starterPrompts?: string | null
  model?: string | null
  author?: string | null
  isPublic?: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export type AgentUpdate = Partial<Omit<AgentInsert, "id" | "userId">>

export type AgentSubagentInsert = {
  id: string
  agentId: string
  name: string
  systemPrompt: string
  model?: string | null
  mcpIds?: string | null
  datasetId?: string | null
  nodeId?: string | null
  createdAt?: Date | null
}

export type AgentSubagentUpdate = Partial<Omit<AgentSubagentInsert, "id" | "agentId">>

/**
 * Returns all agents owned by `userId`, newest first, with their subagents
 * included.
 */
export async function getAgents(userId: string): Promise<AgentWithSubagents[]> {
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...agentWithSubagents,
  })
}

/**
 * Returns a single agent (with subagents) that belongs to `userId`.
 * Returns `undefined` when no matching row exists — callers are responsible
 * for turning that into the correct HTTP response or UI error.
 */
export async function getAgent(
  id: string,
  userId: string,
): Promise<AgentWithSubagents | undefined> {
  const row = await prisma.agent.findFirst({
    where: { id, userId },
    ...agentWithSubagents,
  })
  return row ?? undefined
}

/**
 * Returns a single agent (with subagents) by ID only, without scoping to
 * a user. Used by GET /api/agents/[id] where ownership is checked separately
 * (public agents are readable by any authenticated user).
 */
export async function getAgentById(id: string): Promise<AgentWithSubagents | undefined> {
  const row = await prisma.agent.findFirst({
    where: { id },
    ...agentWithSubagents,
  })
  return row ?? undefined
}

/**
 * Returns all public agents that are NOT owned by `userId`, newest first,
 * with their subagents included. Useful for the library / discovery view.
 */
export async function getPublicAgents(userId: string): Promise<AgentWithSubagents[]> {
  return prisma.agent.findMany({
    where: { isPublic: true, NOT: { userId } },
    orderBy: { createdAt: "desc" },
    ...agentWithSubagents,
  })
}

/**
 * Returns ALL public agents (including the caller's own), newest first.
 * Uses the card-data shape so only the fields needed to render a card are
 * fetched. Called by the library page which shows every public agent.
 */
export async function getAllPublicAgents(): Promise<AgentCardData[]> {
  return prisma.agent.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    ...agentCardData,
  })
}

/**
 * Inserts a new agent row and returns the inserted record with subagents.
 */
export async function insertAgent(values: AgentInsert): Promise<AgentWithSubagents> {
  return prisma.agent.create({
    data: values,
    ...agentWithSubagents,
  })
}

/**
 * Updates agent fields by (id, userId) and returns the updated record with
 * subagents. Throws if the row is not found after the update.
 */
export async function updateAgentRecord(
  id: string,
  userId: string,
  values: AgentUpdate,
): Promise<AgentWithSubagents> {
  return prisma.agent.update({
    where: { id, userId },
    data: values,
    ...agentWithSubagents,
  })
}

/**
 * Deletes an agent row by (id, userId). Subagents and conversations
 * cascade-delete via FK constraint.
 */
export async function deleteAgentRecord(id: string, userId: string): Promise<void> {
  await prisma.agent.delete({ where: { id, userId } })
}

/**
 * Inserts one or more subagent rows.
 */
export async function insertSubagent(
  values: AgentSubagentInsert | AgentSubagentInsert[],
): Promise<void> {
  const rows = Array.isArray(values) ? values : [values]
  await prisma.agentSubagent.createMany({ data: rows })
}

/**
 * Deletes all subagents belonging to an agent.
 */
export async function deleteSubagentsByAgent(agentId: string): Promise<void> {
  await prisma.agentSubagent.deleteMany({ where: { agentId } })
}

/**
 * Deletes a single subagent by its own ID.
 */
export async function deleteSubagentRecord(subagentId: string): Promise<void> {
  await prisma.agentSubagent.delete({ where: { id: subagentId } })
}

/**
 * Updates a subagent row (e.g. to sync nodeId after a graph rebuild).
 */
export async function updateSubagentRecord(
  id: string,
  values: AgentSubagentUpdate,
): Promise<void> {
  await prisma.agentSubagent.update({ where: { id }, data: values })
}

/**
 * Fetches a single subagent by ID.
 */
export async function getSubagent(id: string): Promise<AgentSubagentRow | undefined> {
  const row = await prisma.agentSubagent.findFirst({
    where: { id },
    ...agentSubagentRow,
  })
  return row ?? undefined
}

/**
 * Returns the subagent row that links a given agent to a given dataset, or
 * `undefined` when no such row exists. Used by the dataset-attach flow to
 * guard against duplicate attachments.
 */
export async function getSubagentByAgentAndDataset(
  agentId: string,
  datasetId: string,
): Promise<AgentSubagentRow | undefined> {
  const row = await prisma.agentSubagent.findFirst({
    where: { agentId, datasetId },
    ...agentSubagentRow,
  })
  return row ?? undefined
}

/**
 * Returns the distinct agents that have a subagent row referencing `datasetId`
 * and are owned by `userId`. Used by `datasets/service.ts` to build the
 * `attachedAgents` list for the dataset detail view — keeping raw `prisma`
 * calls out of service.ts.
 */
export async function getAgentsByDataset(
  datasetId: string,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const subagentRows = await prisma.agentSubagent.findMany({
    where: { datasetId, agent: { userId } },
    select: { agent: { select: { id: true, name: true } } },
    distinct: ["agentId"],
  })
  return subagentRows.map((r) => r.agent)
}

/**
 * Returns a map of `agentId → agent name` for every agent ID in the supplied
 * list. Agent IDs that do not exist are omitted from the result.
 *
 * Used by `conversations/service.ts` to enrich conversation rows with agent
 * names without a cross-model JOIN in queries.ts.
 */
export async function getAgentNamesByIds(agentIds: string[]): Promise<Record<string, string>> {
  if (agentIds.length === 0) return {}

  const rows = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  })

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.id] = row.name
  }
  return result
}

/**
 * Returns a map of `datasetId → count of distinct agents attached` for every
 * dataset ID in the supplied list. Dataset IDs that have no attachments are
 * omitted from the result (treat missing key as 0).
 */
export async function getAttachedAgentCountsByDataset(
  datasetIds: string[],
): Promise<Record<string, number>> {
  if (datasetIds.length === 0) return {}

  const grouped = await prisma.agentSubagent.groupBy({
    by: ["datasetId"],
    where: { datasetId: { in: datasetIds } },
    _count: { agentId: true },
  })

  const result: Record<string, number> = {}
  for (const row of grouped) {
    const dsId = row.datasetId
    if (dsId) result[dsId] = row._count.agentId
  }
  return result
}
