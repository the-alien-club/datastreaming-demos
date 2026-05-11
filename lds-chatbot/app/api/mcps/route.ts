import { withAuth } from "@/app/api/_middleware"
import { ok } from "@/lib/api-response"
import { parseBody, createMcpBodySchema, type McpListResponse, type McpRow } from "../_validators"
import { getMcps } from "@/models/mcps/queries"
import { McpPolicy } from "@/models/mcps/policy"
import { createMcp } from "@/models/mcps/service"

export const GET = withAuth(async (_req, user) => {
  const rows = await getMcps(user.id)
  return ok<McpListResponse>(rows)
})

export const POST = withAuth(async (req, user, bouncer) => {
  const parsed = await parseBody(req, createMcpBodySchema)
  if (parsed instanceof Response) return parsed
  await bouncer.with(McpPolicy).authorize("create")
  const created = await createMcp(user.id, parsed)
  return ok<McpRow>(created, 201)
})
