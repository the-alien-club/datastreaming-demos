import { z } from "zod"
import type { Mcp } from "./schema"

const ID = z.string().trim().min(1, "must be non-empty")
const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")

// Pre-built MCP transport union — the platform accepts a fixed set.
const TRANSPORT = z.enum(["streamable_http", "sse", "stdio"])

// HTTP/HTTPS only — `javascript:`/`data:` URIs were accepted before.
const HTTP_URL = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => {
      try {
        const u = new URL(v)
        return u.protocol === "http:" || u.protocol === "https:"
      } catch {
        return false
      }
    },
    { message: "must be a valid http(s) URL" },
  )

const CATEGORY = z.string().trim().min(1).max(80)
const MCP_TYPE = z.string().trim().max(40)
const MCP_PROVIDER = z.string().trim().max(80)
const MCP_PRICE = z.string().trim().max(40)

// ── Schemas ────────────────────────────────────────────────────────────────

export const createMcpBodySchema = z.object({
  name: NAME,
  serverUrl: HTTP_URL,
  transport: TRANSPORT.default("streamable_http"),
  authToken: z.string().nullable().optional(),
  description: SHORT_TEXT.nullable().optional(),
  categories: z.array(CATEGORY).max(20).default([]),
  type: MCP_TYPE.nullable().optional(),
  provider: MCP_PROVIDER.nullable().optional(),
  pricePerQuery: MCP_PRICE.nullable().optional(),
  enabled: z.boolean().optional(),
})
export type CreateMcpBody = z.infer<typeof createMcpBodySchema>

export const updateMcpBodySchema = z.object({
  name: NAME.optional(),
  serverUrl: HTTP_URL.optional(),
  transport: TRANSPORT.optional(),
  authToken: z.string().nullable().optional(),
  description: SHORT_TEXT.nullable().optional(),
  categories: z.array(CATEGORY).max(20).optional(),
  type: MCP_TYPE.nullable().optional(),
  provider: MCP_PROVIDER.nullable().optional(),
  pricePerQuery: MCP_PRICE.nullable().optional(),
  enabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})
export type UpdateMcpBody = z.infer<typeof updateMcpBodySchema>

// Narrow schema for PATCH /api/mcps/[id]/visibility.
export const patchVisibilityBodySchema = z.object({
  isPublic: z.boolean(),
})
export type PatchVisibilityBody = z.infer<typeof patchVisibilityBodySchema>

// ── Response types ─────────────────────────────────────────────────────────

export type McpRow = Mcp

export type McpResponse = McpRow & { isOwn?: boolean }
export type McpListResponse = McpResponse[]

// Available MCPs (the curated picker). Exported from here so the route file
// and consumer components share the same definition.
export interface AvailableMcp {
  id: string
  name: string
  description: string | null
  source: "builtin" | "user"
}

export type AvailableMcpsResponse = {
  builtin: AvailableMcp[]
  userMcps: AvailableMcp[]
}
