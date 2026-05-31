import type { PolicyUser } from "@/lib/bouncer"
import type { Mcp } from "./schema"

export class McpPolicy {
  constructor(private user: PolicyUser) {}

  /**
   * Admin bypass: returning `true` short-circuits all action checks.
   * Returning `undefined` falls through to the specific action method.
   *
   * PolicyUser carries the full better-auth session fields, which may include
   * a `role` field when the session is extended by the admin plugin.
   */
  before(_user: PolicyUser): boolean | undefined {
    if ((this.user as PolicyUser & { role?: string }).role === "admin") return true
    return undefined
  }

  /** Owners and any user when the MCP is public. */
  view(mcp: Mcp): boolean {
    return mcp.userId === this.user.id || mcp.isPublic
  }

  /** Any authenticated user may create an MCP server configuration. */
  create(): boolean {
    return true
  }

  /** Only the owner may edit. */
  edit(mcp: Mcp): boolean {
    return mcp.userId === this.user.id
  }

  /** Only the owner may delete. */
  delete(mcp: Mcp): boolean {
    return mcp.userId === this.user.id
  }
}
