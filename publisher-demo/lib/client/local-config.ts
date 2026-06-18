/**
 * Tiny browser-only helper for persisting the per-browser MCP config slug.
 *
 * The server returns the canonical slug on every `GET /api/demo/config` so
 * the only client-side state we have to keep is the opaque `cfg_*` id. We
 * never store the platform OAT or any other credential here — that stays
 * server-side by construction.
 *
 * Every function is SSR-safe: when called outside the browser (no
 * `window`) it returns `null` / no-ops so Next.js server components and
 * route handlers can import the module without conditional guards.
 */

const STORAGE_KEY = "publisher-demo:config-slug"

/**
 * Read the slug the browser stored on a prior turn. Returns `null` when
 * called during SSR, when no slug has been persisted yet, or when the
 * stored value is obviously malformed (the regex matches the backend's
 * `cfg_[A-Za-z0-9_-]{6,64}` constraint).
 */
export function getStoredConfigSlug(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return /^cfg_[A-Za-z0-9_-]{6,64}$/.test(raw) ? raw : null
  } catch {
    // localStorage can throw in iframes / private mode; treat as absent.
    return null
  }
}

/**
 * Persist the slug returned by the server. The client always overwrites
 * with the latest server-provided value so an env-fallback or a
 * server-side recreate (because the prior slug 404'd) is picked up
 * transparently on the next request.
 */
export function setStoredConfigSlug(slug: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    // Silently ignore quota / private-mode failures; the next request
    // will simply omit the header and the server will create / reuse.
  }
}

/**
 * Drop the stored slug. Used by the future "reset session" affordance and
 * by error-recovery paths if we ever surface one.
 */
export function clearStoredConfigSlug(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
