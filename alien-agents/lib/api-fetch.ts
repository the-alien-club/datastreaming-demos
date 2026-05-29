// Client-side fetch wrapper that prepends NEXT_PUBLIC_BASE_PATH to relative API paths.
//
// Next.js's `basePath` config rewrites `<Link>` and `useRouter()` navigations,
// but it does NOT rewrite plain `fetch()` calls. Without this helper, calls
// like `fetch("/api/mcps")` from the browser hit `https://host/api/mcps` and
// 404, because the app is mounted at `https://host/agents/`.
//
// Usage:
//   import { apiFetch, apiUrl } from "@/lib/api-fetch"
//   await apiFetch("/api/mcps")
//   new DefaultChatTransport({ api: apiUrl("/api/chat") })
//
// Server-side route handlers should NOT use this — they make local in-process
// requests that don't go through Next.js's URL rewriting.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

/**
 * Prepend the configured basePath to a path that starts with "/".
 * Absolute URLs (http://, https://) and protocol-relative URLs are returned unchanged.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith("//")) {
    return path
  }
  if (!path.startsWith("/")) {
    throw new Error(
      `apiUrl: path must start with "/" (got: ${JSON.stringify(path)})`,
    )
  }
  return `${basePath}${path}`
}

/**
 * basePath-aware fetch wrapper. Use for every client-side `/api/...` call.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init)
}
