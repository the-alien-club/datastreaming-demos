import { auth } from "@/lib/auth"
import { unauthorized, forbidden } from "@/lib/api-response"
import { bouncer, AuthorizationError, type Bouncer, type PolicyUser } from "@/lib/bouncer"
import { getUserOrgRole } from "@/lib/platform/onboarding"

// Handler signature for routes that require an authenticated user.
//
// `user`    — enriched session user (session fields + orgRole); never null inside the handler.
// `bouncer` — pre-scoped to `user`; use `bouncer.with(Policy).authorize(action, resource)`.
// `context` — Next.js App Router route context; `context.params` is a Promise for dynamic segments.
type AuthedHandler = (
  req: Request,
  user: PolicyUser,
  bouncer: Bouncer,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>

// `withAuth` is the only entry point for authenticated routes.
//
// It resolves the session, resolves the user's org role from the platform API,
// injects the enriched user and a pre-scoped bouncer, and catches
// `AuthorizationError` so route handlers never need to.
//
// `orgRole` is resolved on every authenticated request so that policy methods
// can enforce org-level restrictions (e.g. `create` gated on non-client role)
// without delegating that decision to another layer. `getUserOrgRole` never
// throws — it returns null when the platform is unreachable or ORG_ID is not
// configured. Policies treat null as non-client (permissive), so standalone
// deployments without org configuration remain fully functional.
//
// Streaming routes (`/api/chat`, `/api/chat/resume`) are exempt — they
// handle auth manually because they control the response stream directly.
export function withAuth(handler: AuthedHandler) {
  return async (
    req: Request,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return unauthorized()

    const orgRole = await getUserOrgRole(session.user.id)
    const enrichedUser: PolicyUser = { ...session.user, orgRole }

    try {
      return await handler(req, enrichedUser, bouncer(enrichedUser), context)
    } catch (e) {
      if (e instanceof AuthorizationError) return forbidden()
      throw e
    }
  }
}
