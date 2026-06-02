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

  /** Any authenticated user may create an agent. */
  create(): boolean {
    return true
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

  /** Any authenticated user may fork a public agent into their own workspace. */
  fork(): boolean {
    return true
  }
}
