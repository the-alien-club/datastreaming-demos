import type { PolicyUser } from "@/lib/bouncer"
import type { AgentRow } from "./schema"

export class AgentPolicy {
  constructor(private user: PolicyUser) {}

  /**
   * Admin bypass — returning `true` short-circuits every action method.
   * Returns `undefined` to fall through to the specific action check.
   *
   * better-auth does not expose an `isAdmin` field by default; if a custom
   * session extension adds it, cast `this.user` to the extended type here.
   * For now this always falls through.
   */
  before(_user: PolicyUser): boolean | undefined {
    return undefined
  }

  /**
   * Any user may view a public agent. Owners see the full detail view.
   */
  view(agent: AgentRow): boolean {
    return agent.userId === this.user.id || agent.isPublic
  }

  /**
   * Non-client org members may create agents.
   *
   * orgRole is resolved by withAuth from the platform API and injected into
   * PolicyUser. When orgRole is null (platform unreachable or ORG_ID not
   * configured), we treat the user as non-client so standalone deployments
   * remain functional. This is explicitly not a delegation to another layer —
   * the policy enforces the constraint itself.
   */
  create(): boolean {
    return this.user.orgRole !== "org-client"
  }

  /**
   * Only the owner may edit an agent.
   */
  edit(agent: AgentRow): boolean {
    return agent.userId === this.user.id
  }

  /**
   * Only the owner may delete an agent.
   */
  delete(agent: AgentRow): boolean {
    return agent.userId === this.user.id
  }

  /**
   * Only the owner may toggle an agent's public visibility.
   */
  publish(agent: AgentRow): boolean {
    return agent.userId === this.user.id
  }
}
