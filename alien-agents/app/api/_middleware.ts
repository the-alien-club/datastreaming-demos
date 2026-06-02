import { auth } from "@/lib/auth"
import { unauthorized, forbidden } from "@/lib/api-response"
import { bouncer, AuthorizationError, type Bouncer, type PolicyUser } from "@/lib/bouncer"

// Handler signature for routes that require an authenticated user.
//
// `user`    — session user; never null inside the handler.
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
// It resolves the session, injects the user and a pre-scoped bouncer, and
// catches `AuthorizationError` so route handlers never need to.
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

    try {
      return await handler(req, session.user, bouncer(session.user), context)
    } catch (e) {
      if (e instanceof AuthorizationError) return forbidden()
      throw e
    }
  }
}
