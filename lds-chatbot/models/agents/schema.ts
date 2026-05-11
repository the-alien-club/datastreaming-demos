import { Prisma } from "@/lib/generated/prisma/client"

// ── Query shapes ───────────────────────────────────────────────────────────────
//
// Prisma v7 no longer ships `Prisma.validator` in the generated client.
// `satisfies` achieves the same goal: the object literal is constrained to a
// valid `AgentDefaultArgs` shape, literal types are preserved, and
// `AgentGetPayload<typeof shape>` derives an accurate TypeScript type.

// Full agent record including all subagents. Used by every query that loads an
// agent for display, editing, or workflow rebuild.
export const agentWithSubagents = {
  include: { subagents: true },
} satisfies Prisma.AgentDefaultArgs
export type AgentWithSubagents = Prisma.AgentGetPayload<typeof agentWithSubagents>

// Plain agent row without relations. Used by policies that only need scalar
// fields (userId, isPublic) to make an access-control decision.
export const agentRow = {
  select: {
    id: true,
    userId: true,
    workflowId: true,
    name: true,
    description: true,
    systemPrompt: true,
    steps: true,
    starterPrompts: true,
    model: true,
    author: true,
    isPublic: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.AgentDefaultArgs
export type AgentRow = Prisma.AgentGetPayload<typeof agentRow>

// Plain subagent row without relations. Used by service operations that need a
// single subagent after insertion.
export const agentSubagentRow = {
  select: {
    id: true,
    agentId: true,
    name: true,
    systemPrompt: true,
    model: true,
    mcpIds: true,
    datasetId: true,
    nodeId: true,
    createdAt: true,
  },
} satisfies Prisma.AgentSubagentDefaultArgs
export type AgentSubagentRow = Prisma.AgentSubagentGetPayload<typeof agentSubagentRow>
