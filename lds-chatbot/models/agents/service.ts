import "server-only"

import {
  getAgent,
  getAgentById,
  insertAgent,
  updateAgentRecord,
  deleteAgentRecord,
  insertSubagent,
  deleteSubagentsByAgent,
  deleteSubagentRecord,
  updateSubagentRecord,
  getSubagent,
} from "./queries"
import { createWorkflow, updateWorkflow, deleteWorkflow, cancelResponse } from "@/lib/platform/client"
import { buildAgentWorkflow, type SubagentConfig } from "@/lib/platform/workflows"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import type { AgentWithSubagents, AgentSubagentRow } from "./schema"
import type { CreateAgentData, UpdateAgentData, SubagentCreateData } from "./types"

// ── Typed errors ───────────────────────────────────────────────────────────

export class AgentWorkflowNotFoundError extends Error {
  constructor(workflowId: number) {
    super(`Workflow ${workflowId} not found on the platform. The agent may need to be deleted and recreated.`)
    this.name = "AgentWorkflowNotFoundError"
  }
}

// ── Create ─────────────────────────────────────────────────────────────────

/**
 * Creates a new agent: builds the workflow graph, persists it on the platform,
 * then inserts the agent and subagent rows in the local database.
 *
 * @returns The newly created agent with subagents.
 */
export async function createAgent(
  userId: string,
  body: CreateAgentData,
): Promise<AgentWithSubagents> {
  const name = body.name.trim()
  const description = body.description ?? null
  const systemPrompt = body.systemPrompt
  const steps = body.steps
  const model = body.model ?? DEFAULT_MODEL_SLUG
  const starterPrompts =
    body.starterPrompts && body.starterPrompts.length > 0 ? body.starterPrompts : null

  const subagentConfigs: SubagentConfig[] = body.subagents.map((sa) => ({
    name: sa.name,
    description: sa.description ?? "",
    systemPrompt: sa.systemPrompt,
    model: sa.model,
    mcpIds: sa.mcpIds,
  }))

  const mcpConfigs = await loadEnabledMcpConfigs(userId)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
    { name, systemPrompt, steps, model, subagents: subagentConfigs },
    mcpConfigs,
  )

  const token = await resolveAccessToken(userId)
  const slug = `lds-agent-${crypto.randomUUID()}`
  const workflowResponse = await createWorkflow(
    {
      name: `LDS Agent: ${name}`,
      slug,
      description: description ?? undefined,
      isPublic: false,
      type: "streaming",
      nodes,
      edges,
    },
    token,
  )

  const agentId = crypto.randomUUID()
  const now = new Date()

  await insertAgent({
    id: agentId,
    userId,
    workflowId: workflowResponse.id,
    name,
    description,
    systemPrompt,
    author: body.author?.trim() || null,
    steps: JSON.stringify(steps),
    starterPrompts: starterPrompts ? JSON.stringify(starterPrompts) : null,
    model,
    createdAt: now,
    updatedAt: now,
  })

  if (body.subagents.length > 0) {
    await insertSubagent(
      body.subagents.map((sa, i) => ({
        id: crypto.randomUUID(),
        agentId,
        name: sa.name,
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: JSON.stringify(sa.mcpIds),
        datasetId: sa.datasetId ?? null,
        nodeId: subagentNodeIds[i] ?? null,
        createdAt: now,
      })),
    )
  }

  const created = await getAgent(agentId, userId)
  if (!created) throw new Error(`Agent ${agentId} not found after creation`)
  return created
}

// ── Update ─────────────────────────────────────────────────────────────────

type SubagentConfigWithDataset = SubagentConfig & { datasetId: string | null }

/**
 * Full-replace update of an agent: rebuilds the workflow graph, patches it on
 * the platform, updates the agent row, and replaces all subagents.
 *
 * @returns The updated agent with subagents.
 * @throws If the agent has no linked workflow.
 */
export async function updateAgent(
  id: string,
  userId: string,
  body: UpdateAgentData,
): Promise<AgentWithSubagents> {
  const existing = await getAgent(id, userId)
  if (!existing) throw new Error(`Agent ${id} not found`)
  if (!existing.workflowId) throw new Error("Agent has no linked workflow")

  const name = body.name.trim()
  const description = "description" in body ? (body.description ?? null) : existing.description
  const author = "author" in body ? (body.author?.trim() || null) : existing.author
  const createdAt = body.createdAt ? new Date(body.createdAt) : existing.createdAt
  const systemPrompt = body.systemPrompt
  const steps = body.steps
  const model = body.model

  const parsedStarterPrompts: string[] | null =
    body.starterPrompts !== undefined
      ? (() => {
          const cleaned = body.starterPrompts.filter((p) => p.trim() !== "")
          return cleaned.length > 0 ? cleaned : null
        })()
      : existing.starterPrompts
        ? (JSON.parse(existing.starterPrompts) as string[])
        : null

  const subagentConfigs: SubagentConfigWithDataset[] = body.subagents.map((sa) => ({
    name: sa.name,
    description: sa.description ?? "",
    systemPrompt: sa.systemPrompt,
    model: sa.model,
    mcpIds: sa.mcpIds,
    datasetId: sa.datasetId ?? null,
  }))

  const mcpConfigs = await loadEnabledMcpConfigs(userId)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
    { name, systemPrompt, steps, model, subagents: subagentConfigs },
    mcpConfigs,
  )

  const token = await resolveAccessToken(userId)
  try {
    await updateWorkflow(existing.workflowId, { nodes, edges, name: `LDS Agent: ${name}` }, token)
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      throw new AgentWorkflowNotFoundError(existing.workflowId)
    }
    throw err
  }

  const now = new Date()

  await updateAgentRecord(id, userId, {
    name,
    description,
    author,
    createdAt: createdAt ?? undefined,
    systemPrompt,
    steps: JSON.stringify(steps),
    starterPrompts: parsedStarterPrompts ? JSON.stringify(parsedStarterPrompts) : null,
    model,
    updatedAt: now,
  })

  await deleteSubagentsByAgent(id)

  if (subagentConfigs.length > 0) {
    await insertSubagent(
      subagentConfigs.map((sa, i) => ({
        id: crypto.randomUUID(),
        agentId: id,
        name: sa.name,
        systemPrompt: sa.systemPrompt,
        model: sa.model,
        mcpIds: JSON.stringify(sa.mcpIds),
        datasetId: sa.datasetId,
        nodeId: subagentNodeIds[i] ?? null,
        createdAt: now,
      })),
    )
  }

  const updated = await getAgent(id, userId)
  if (!updated) throw new Error(`Agent ${id} not found after update`)
  return updated
}

// ── Delete ─────────────────────────────────────────────────────────────────

/**
 * Deletes an agent: removes the workflow from the platform (if linked), then
 * deletes the local agent row. Subagents and conversations cascade-delete via
 * FK constraint.
 */
export async function deleteAgent(id: string, userId: string): Promise<void> {
  const existing = await getAgent(id, userId)
  if (!existing) throw new Error(`Agent ${id} not found`)

  if (existing.workflowId) {
    const token = await resolveAccessToken(userId)
    await deleteWorkflow(existing.workflowId, token)
  }

  await deleteAgentRecord(id, userId)
}

// ── Add subagent ───────────────────────────────────────────────────────────

/**
 * Adds a new subagent to an existing agent: rebuilds the graph, patches the
 * platform workflow, updates nodeIds for existing subagents, and inserts the
 * new subagent row.
 *
 * @returns The newly inserted subagent row.
 */
export async function addSubagent(
  agentId: string,
  userId: string,
  body: SubagentCreateData,
): Promise<AgentSubagentRow> {
  const existing = await getAgent(agentId, userId)
  if (!existing) throw new Error(`Agent ${agentId} not found`)
  if (!existing.workflowId) throw new Error("Agent has no linked workflow")

  const existingSubagentConfigs: SubagentConfig[] = existing.subagents.map((sa) => ({
    name: sa.name,
    description: "",
    systemPrompt: sa.systemPrompt,
    model: sa.model ?? DEFAULT_MODEL_SLUG,
    mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
  }))

  const newSubagentConfig: SubagentConfig = {
    name: body.name,
    description: body.description ?? "",
    systemPrompt: body.systemPrompt,
    model: body.model,
    mcpIds: body.mcpIds,
  }

  const allSubagents = [...existingSubagentConfigs, newSubagentConfig]

  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(userId)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
    {
      name: existing.name,
      systemPrompt: existing.systemPrompt ?? "",
      steps,
      model: existing.model ?? DEFAULT_MODEL_SLUG,
      subagents: allSubagents,
    },
    mcpConfigs,
  )

  const token = await resolveAccessToken(userId)
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  const now = new Date()
  const subagentId = crypto.randomUUID()

  // Update nodeIds for existing subagents (their positions may have shifted).
  await Promise.all(
    existing.subagents.map((row, i) =>
      updateSubagentRecord(row.id, { nodeId: subagentNodeIds[i] ?? null }),
    ),
  )

  await insertSubagent({
    id: subagentId,
    agentId,
    name: newSubagentConfig.name,
    systemPrompt: newSubagentConfig.systemPrompt,
    model: newSubagentConfig.model,
    mcpIds: JSON.stringify(newSubagentConfig.mcpIds),
    datasetId: body.datasetId ?? null,
    nodeId: subagentNodeIds[existing.subagents.length] ?? null,
    createdAt: now,
  })

  await updateAgentRecord(agentId, userId, { updatedAt: now })

  const subagent = await getSubagent(subagentId)
  if (!subagent) throw new Error(`Subagent ${subagentId} not found after insertion`)
  return subagent
}

// ── Remove subagent ────────────────────────────────────────────────────────

/**
 * Removes a subagent from an agent: rebuilds the graph without the removed
 * subagent, patches the platform workflow, deletes the subagent row, and
 * updates nodeIds for the remaining subagents.
 */
export async function removeSubagent(
  agentId: string,
  userId: string,
  subagentId: string,
): Promise<void> {
  const existing = await getAgent(agentId, userId)
  if (!existing) throw new Error(`Agent ${agentId} not found`)
  if (!existing.workflowId) throw new Error("Agent has no linked workflow")

  const subagentToRemove = existing.subagents.find((sa) => sa.id === subagentId)
  if (!subagentToRemove) throw new Error(`Subagent ${subagentId} not found`)

  const remainingSubagents: SubagentConfig[] = existing.subagents
    .filter((sa) => sa.id !== subagentId)
    .map((sa) => ({
      name: sa.name,
      description: "",
      systemPrompt: sa.systemPrompt,
      model: sa.model ?? DEFAULT_MODEL_SLUG,
      mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
    }))

  const steps = existing.steps ? JSON.parse(existing.steps) : []
  const mcpConfigs = await loadEnabledMcpConfigs(userId)
  const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
    {
      name: existing.name,
      systemPrompt: existing.systemPrompt ?? "",
      steps,
      model: existing.model ?? DEFAULT_MODEL_SLUG,
      subagents: remainingSubagents,
    },
    mcpConfigs,
  )

  const token = await resolveAccessToken(userId)
  await updateWorkflow(existing.workflowId, { nodes, edges }, token)

  await deleteSubagentRecord(subagentId)

  const remainingRows = existing.subagents.filter((sa) => sa.id !== subagentId)
  await Promise.all(
    remainingRows.map((row, i) =>
      updateSubagentRecord(row.id, { nodeId: subagentNodeIds[i] ?? null }),
    ),
  )
}

// ── Patch visibility ───────────────────────────────────────────────────────

/**
 * Toggles the public-visibility flag of an agent.
 *
 * @returns The updated agent with subagents.
 */
export async function patchAgentVisibility(
  id: string,
  userId: string,
  isPublic: boolean,
): Promise<AgentWithSubagents> {
  return updateAgentRecord(id, userId, { isPublic, updatedAt: new Date() })
}

// ── Cancel response ────────────────────────────────────────────────────────

/**
 * Cancels an in-progress platform response for an agent. The caller must
 * verify ownership via `AgentPolicy.edit` before calling this method.
 *
 * @throws When the agent has no linked workflow or the platform call fails.
 */
export async function cancelAgentResponse(
  agent: AgentWithSubagents,
  responseId: string,
  userId: string,
): Promise<{ cancelled: boolean }> {
  if (!agent.workflowId) throw new Error("Agent has no linked workflow")
  const token = await resolveAccessToken(userId)
  return cancelResponse(agent.workflowId, responseId, token)
}

// ── Fork ───────────────────────────────────────────────────────────────────

/**
 * Creates a copy of a public agent under a new owner.
 *
 * The source agent has already been loaded and access-checked by the route
 * handler (AgentPolicy.view + AgentPolicy.fork). The forked agent is private
 * by default. Dataset attachments on subagents are dropped — they reference
 * the source user's corpus which the new owner does not have access to.
 *
 * @returns The newly created agent with subagents.
 */
export async function forkAgent(
  source: AgentWithSubagents,
  targetUserId: string,
): Promise<AgentWithSubagents> {
  const steps = source.steps
    ? (JSON.parse(source.steps) as { name: string; prompt: string }[])
    : []
  const starterPrompts = source.starterPrompts
    ? (JSON.parse(source.starterPrompts) as string[])
    : []

  const body: CreateAgentData = {
    name: `${source.name} (copie)`,
    description: source.description ?? undefined,
    systemPrompt: source.systemPrompt ?? "",
    author: source.author ?? undefined,
    steps,
    model: source.model ?? undefined,
    starterPrompts: starterPrompts.length > 0 ? starterPrompts : undefined,
    subagents: source.subagents.map((sa) => ({
      name: sa.name,
      systemPrompt: sa.systemPrompt,
      model: sa.model,
      mcpIds: JSON.parse(sa.mcpIds) as string[],
      datasetId: null,
    })),
  }

  return createAgent(targetUserId, body)
}

// ── Get by ID (public or owner) ────────────────────────────────────────────

/**
 * Loads an agent by ID without a userId scope. The caller must enforce
 * visibility with `AgentPolicy.view()`.
 */
export async function getAgentForView(id: string): Promise<AgentWithSubagents | undefined> {
  return getAgentById(id)
}
