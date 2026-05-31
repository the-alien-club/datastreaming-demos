import type { PolicyUser } from "@/lib/bouncer"
import type { Specialist } from "./schema"

export class SpecialistPolicy {
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

  /** Owners and any user when the specialist is public. */
  view(specialist: Specialist): boolean {
    return specialist.userId === this.user.id || specialist.isPublic
  }

  /** Any authenticated user may create a specialist. */
  create(): boolean {
    return true
  }

  /** Only the owner may edit. */
  edit(specialist: Specialist): boolean {
    return specialist.userId === this.user.id
  }

  /** Only the owner may delete. */
  delete(specialist: Specialist): boolean {
    return specialist.userId === this.user.id
  }

  /** Only the owner may toggle public visibility. */
  publish(specialist: Specialist): boolean {
    return specialist.userId === this.user.id
  }

  /** Any authenticated user may fork a public specialist. */
  fork(): boolean {
    return true
  }
}
