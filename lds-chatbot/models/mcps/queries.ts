import "server-only"

import { prisma } from "@/lib/db"
import { mcpRow, type Mcp } from "./schema"
import type { McpUncheckedCreateInput } from "@/lib/generated/prisma/models"

export type McpWithOwnership = Mcp & { isOwn: boolean }

/**
 * Returns all MCP servers owned by `userId` (plus public ones from other
 * users), newest first.
 */
export async function getMcps(userId: string): Promise<McpWithOwnership[]> {
  const [ownRows, publicRows] = await Promise.all([
    prisma.mcp.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      ...mcpRow,
    }),
    prisma.mcp.findMany({
      where: { isPublic: true, userId: { not: userId } },
      orderBy: { createdAt: "desc" },
      ...mcpRow,
    }),
  ])

  return [
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ]
}

/**
 * Returns a single MCP server row matching `id` and `userId`.
 * Returns `undefined` when no matching row exists.
 */
export async function getMcp(id: string, userId: string): Promise<Mcp | undefined> {
  const row = await prisma.mcp.findFirst({ where: { id, userId }, ...mcpRow })
  return row ?? undefined
}

/**
 * Returns a single MCP server row by `id` only, without filtering by owner.
 * The caller is responsible for enforcing ownership via `McpPolicy` before
 * returning data to the requesting user.
 *
 * Returns `undefined` when no matching row exists.
 */
export async function getMcpById(id: string): Promise<Mcp | undefined> {
  const row = await prisma.mcp.findUnique({ where: { id }, ...mcpRow })
  return row ?? undefined
}

/**
 * Returns all enabled MCP servers visible to `userId`: own + public from others.
 * Used by the available-MCPs endpoint to populate the wizard picker.
 */
export async function getEnabledMcps(userId: string): Promise<McpWithOwnership[]> {
  const [ownRows, publicRows] = await Promise.all([
    prisma.mcp.findMany({
      where: { enabled: true, userId },
      orderBy: { createdAt: "desc" },
      ...mcpRow,
    }),
    prisma.mcp.findMany({
      where: { enabled: true, isPublic: true, userId: { not: userId } },
      orderBy: { createdAt: "desc" },
      ...mcpRow,
    }),
  ])

  return [
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ]
}

/**
 * Inserts a new MCP server row and returns the created record.
 */
export async function insertMcp(values: McpUncheckedCreateInput): Promise<Mcp> {
  return prisma.mcp.create({ data: values, ...mcpRow })
}

/**
 * Updates fields on an existing MCP server row identified by `id`.
 * Returns the updated record.
 */
export async function updateMcpRecord(id: string, values: Partial<Omit<Mcp, "id">>): Promise<Mcp> {
  return prisma.mcp.update({ where: { id }, data: values, ...mcpRow })
}

/**
 * Deletes the MCP server row identified by `id`.
 */
export async function deleteMcpRecord(id: string): Promise<void> {
  await prisma.mcp.delete({ where: { id } })
}
