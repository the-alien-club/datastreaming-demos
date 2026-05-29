import "server-only"

import { insertMcp, updateMcpRecord, deleteMcpRecord, getEnabledMcps } from "./queries"
import { DEFAULT_MCP_TRANSPORT } from "@/lib/constants"
import type { Mcp } from "./schema"
import type { CreateMcpBody, UpdateMcpBody, AvailableMcp, AvailableMcpsResponse } from "./types"

// MCPs whose ids match these slug prefixes are surfaced under a curated
// "Built-in" section in the UI; everything else (user-created) shows up
// under "User MCPs". The split is purely presentational — both source rows
// live in the same `mcps` table.
//
// Built-in ids follow the `<slug>:<userId>` shape (one per user). The set is
// empty in the Alien Agents public demo (the legacy LDS seed script that
// populated it was removed during the rebrand); add slugs here if a future
// seeder bootstraps curated built-ins.
const BUILTIN_MCP_SLUGS = new Set<string>()

function builtinSlug(id: string): string | null {
  const colon = id.indexOf(":")
  if (colon < 0) return null
  const slug = id.slice(0, colon)
  return BUILTIN_MCP_SLUGS.has(slug) ? slug : null
}

/**
 * Creates a new MCP server entry for `userId` from the validated request body.
 * Returns the persisted record.
 */
export async function createMcp(userId: string, data: CreateMcpBody): Promise<Mcp> {
  const now = new Date()
  const id = crypto.randomUUID()

  return insertMcp({
    id,
    userId,
    name: data.name.trim(),
    serverUrl: data.serverUrl.trim(),
    transport: data.transport ?? DEFAULT_MCP_TRANSPORT,
    authToken: data.authToken ?? null,
    description: data.description ?? null,
    categories: data.categories ?? [],
    type: data.type ?? null,
    provider: data.provider ?? null,
    pricePerQuery: data.pricePerQuery ?? null,
    enabled: data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * Updates an existing MCP server identified by `id` with the validated
 * request body. Ownership and existence must be verified by the caller.
 * Returns the updated record.
 *
 * Merge semantics: any field present in `data` replaces the existing value;
 * absent fields retain `existing` values. Nullable fields use `"key" in data`
 * to distinguish explicit null from absent.
 */
export async function updateMcp(
  id: string,
  data: UpdateMcpBody,
  existing: Mcp,
): Promise<Mcp> {
  return updateMcpRecord(id, {
    name: data.name?.trim() ?? existing.name,
    serverUrl: data.serverUrl?.trim() ?? existing.serverUrl,
    transport: data.transport ?? existing.transport,
    authToken: "authToken" in data ? (data.authToken ?? null) : existing.authToken,
    description: "description" in data ? (data.description ?? null) : existing.description,
    categories: "categories" in data && data.categories ? data.categories : existing.categories,
    type: "type" in data ? (data.type ?? null) : existing.type,
    provider: "provider" in data ? (data.provider ?? null) : existing.provider,
    pricePerQuery: "pricePerQuery" in data ? (data.pricePerQuery ?? null) : existing.pricePerQuery,
    enabled: data.enabled ?? existing.enabled,
    isPublic: data.isPublic ?? existing.isPublic,
    updatedAt: new Date(),
  })
}

/**
 * Deletes the MCP server identified by `id`.
 * Ownership must be verified by the caller before invoking.
 */
export async function deleteMcp(id: string): Promise<void> {
  await deleteMcpRecord(id)
}

/**
 * Returns the categorised list of MCP servers available to `userId` for use
 * in the subagent configuration UI.
 *
 * - `builtin`: seeded built-in MCPs (matched by slug prefix allow-list)
 * - `userMcps`: all other user-created or non-seeded enabled MCPs
 */
export async function getAvailableMcps(userId: string): Promise<AvailableMcpsResponse> {
  const rows = await getEnabledMcps(userId)

  const toAvailable = (r: (typeof rows)[number]): AvailableMcp => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    source: builtinSlug(r.id) !== null ? "builtin" : "user",
  })

  const all: AvailableMcp[] = rows.map(toAvailable)

  const builtin = all.filter((m) => m.source === "builtin")
  const userMcps = all.filter((m) => m.source === "user")

  return { builtin, userMcps }
}
