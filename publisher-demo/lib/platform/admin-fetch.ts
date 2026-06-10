import { env } from "../env"

const BASE = env.PLATFORM_API_URL.replace(/\/$/, "")

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${env.ADMIN_OAT}`,
      // Pin every request to the demo's organization so the OAT user's other
      // org memberships can't leak into the resolved configuration, catalogs,
      // or pricing surface.
      "x-organization-id": env.ORG_ID,
      connection: "close",
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  return res
}

export async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)")
    throw new Error(`Platform ${res.status} on ${path}: ${body}`)
  }
  const json = (await res.json()) as { data?: T } | T
  if (json !== null && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}
