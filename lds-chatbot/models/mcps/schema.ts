import { Prisma } from "@/lib/generated/prisma/client"

// ─── Domain enums ──────────────────────────────────────────────────────────────

/**
 * All three transport modes accepted by the platform's MCP server node and
 * the `mcps.transport` column. Use these instead of bare string literals.
 */
export const MCP_TRANSPORT = {
  StreamableHttp: "streamable_http",
  Sse: "sse",
  Stdio: "stdio",
} as const
export type McpTransport = (typeof MCP_TRANSPORT)[keyof typeof MCP_TRANSPORT]

// ─── Query shapes ──────────────────────────────────────────────────────────────
//
// Prisma v7 no longer ships `Prisma.validator` in the generated client.
// `satisfies` achieves the same goal: the object literal is constrained to a
// valid `McpDefaultArgs` shape, literal types are preserved, and
// `McpGetPayload<typeof shape>` derives an accurate TypeScript type.

// Minimal MCP name lookup shape. Used wherever only id + name are needed
// (e.g. resolving MCP names for display in specialist cards).
export const mcpNameRow = {
  select: {
    id: true,
    name: true,
  },
} satisfies Prisma.McpDefaultArgs
export type McpName = Prisma.McpGetPayload<typeof mcpNameRow>

// Plain MCP server row. Used by policies and every query that returns MCP
// records without cross-model relations.
export const mcpRow = {
  select: {
    id: true,
    userId: true,
    name: true,
    serverUrl: true,
    transport: true,
    authToken: true,
    description: true,
    categories: true,
    type: true,
    provider: true,
    pricePerQuery: true,
    enabled: true,
    isPublic: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.McpDefaultArgs
export type Mcp = Prisma.McpGetPayload<typeof mcpRow>
