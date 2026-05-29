import { withAuth } from "@/app/api/_middleware"
import { getMcpById } from "@/models/mcps/queries"
import { McpPolicy } from "@/models/mcps/policy"
import { updateMcp, deleteMcp } from "@/models/mcps/service"
import { ok, notFound } from "@/lib/api-response"
import { parseBody, updateMcpBodySchema, type McpRow } from "../../_validators"

/**
 * GET /api/mcps/:id
 *
 * Returns the MCP server entry. Owners and any user when the MCP is public.
 */
export const GET = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const mcp = await getMcpById(id)
  if (!mcp) return notFound()
  await bouncer.with(McpPolicy).authorize("view", mcp)
  return ok<McpRow>(mcp)
})

/**
 * PUT /api/mcps/:id
 *
 * Full-replace update of an MCP server entry. Only the owner may edit.
 */
export const PUT = withAuth(async (req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const mcp = await getMcpById(id)
  if (!mcp) return notFound()
  await bouncer.with(McpPolicy).authorize("edit", mcp)
  const parsed = await parseBody(req, updateMcpBodySchema)
  if (parsed instanceof Response) return parsed
  const updated = await updateMcp(id, parsed, mcp)
  return ok<McpRow>(updated)
})

/**
 * DELETE /api/mcps/:id
 *
 * Deletes the MCP server entry. Only the owner may delete.
 */
export const DELETE = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const mcp = await getMcpById(id)
  if (!mcp) return notFound()
  await bouncer.with(McpPolicy).authorize("delete", mcp)
  await deleteMcp(id)
  return new Response(null, { status: 204 })
})
