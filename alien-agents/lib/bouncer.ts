import type { auth } from "@/lib/auth"

// The base User type is derived from the better-auth session inferred type so
// it stays in sync with whatever fields better-auth exposes without requiring a
// separate manual type declaration.
type SessionUser = typeof auth.$Infer.Session.user

// PolicyUser is the user object injected by withAuth. Policies declare their
// constructor as `(user: PolicyUser)` and read this type via `this.user` —
// they never receive the user as a method argument.
export type PolicyUser = SessionUser

// Re-export as `User` so existing imports of `type { User } from "@/lib/bouncer"`
// continue to compile while we migrate callers to PolicyUser.
export type User = PolicyUser

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "AuthorizationError"
  }
}

// A policy class passed to bouncer.with() must accept a PolicyUser in its
// constructor. The optional `before` hook is the admin bypass: returning
// `true` short-circuits all per-action checks.
export interface Policy {
  before?(user: PolicyUser): boolean | undefined
}

export interface Bouncer {
  with<P extends Policy>(
    PolicyClass: new (user: PolicyUser) => P,
  ): {
    authorize(action: keyof P & string, resource?: unknown): Promise<void>
  }
}

export function bouncer(user: PolicyUser): Bouncer {
  return {
    with(PolicyClass) {
      const policy = new PolicyClass(user)
      return {
        async authorize(action, resource) {
          // `before()` is the admin bypass hook.
          // Returning `true` allows everything unconditionally.
          // Returning `undefined` or `false` falls through to the per-action check.
          if (policy.before?.(user) === true) return

          const method = (policy as Record<string, unknown>)[action]
          if (typeof method !== "function") {
            throw new AuthorizationError(`No policy method for action "${action}"`)
          }
          const allowed = await (method as (resource: unknown) => Promise<boolean> | boolean).call(
            policy,
            resource,
          )
          if (!allowed) throw new AuthorizationError()
        },
      }
    },
  }
}
