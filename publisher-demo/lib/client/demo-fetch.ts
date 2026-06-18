/**
 * Thin `fetch` wrapper that adds `x-demo-config-slug` to every call against
 * the demo's own `/api/demo/*` route handlers. The header carries the slug
 * the browser persisted in localStorage on a prior response so the server
 * resolves the same per-browser MCP configuration on every turn.
 *
 * Used by every client-side caller of `/api/demo/*` — `useConfig`,
 * `usePricing`, `useDynamicSuggestions`, and both mode runners. Using a
 * single wrapper keeps the header surface visible in one place.
 */

import { getStoredConfigSlug } from "./local-config"

const CONFIG_SLUG_HEADER = "x-demo-config-slug"

/**
 * Wrap `fetch` so the persisted slug is sent on every request. Caller-supplied
 * headers win on conflict — the demo never overrides an explicitly-set header,
 * which keeps debugging hooks (e.g. forcing a particular slug from devtools)
 * intact.
 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const slug = getStoredConfigSlug()
  if (!slug) {
    return fetch(input, init)
  }

  const headers = new Headers(init?.headers)
  if (!headers.has(CONFIG_SLUG_HEADER)) {
    headers.set(CONFIG_SLUG_HEADER, slug)
  }

  return fetch(input, { ...init, headers })
}
