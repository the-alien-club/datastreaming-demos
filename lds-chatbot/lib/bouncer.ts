import type { auth } from "@/lib/auth"

// The base User type is derived from the better-auth session inferred type so
// it stays in sync with whatever fields better-auth exposes without requiring a
// separate manual type declaration.
type SessionUser = typeof auth.$Infer.Session.user

// PolicyUser is the enriched user object injected by withAuth. It carries the
// base session fields plus orgRole resolved from the platform API. Policies
// declare their constructor as `(user: PolicyUser)` and read this type via
// `this.user` — they never receive the user as a method argument.
//
// orgRole values mirror the platform's role slugs. `null` means the platform
// is unreachable or ORG_ID is not configured; callers must treat null as
// non-client (permissive fallback) to avoid locking out standalone deployments.
export type PolicyUser = SessionUser & {
  orgRole: string | null
}

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
