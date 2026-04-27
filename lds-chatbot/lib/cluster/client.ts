import { Configuration, DatasetsApi, EntriesApi, PipelinesApi } from "@alien/data-api-client"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL!
const CLUSTER_ID = process.env.CLUSTER_ID!

// Opt-in request tracing for the cluster proxy. Off by default — the headers
// for these requests carry the user's `x-oauth-access-token` and must NEVER
// reach prod stdout. Enable locally with `DEBUG_CLUSTER_CLIENT=1` to inspect
// shape/timing; auth headers are always redacted before logging.
const DEBUG_CLUSTER_CLIENT = process.env.DEBUG_CLUSTER_CLIENT === "1"

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "x-oauth-access-token",
  "cookie",
  "set-cookie",
])

function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  const entries: Array<[string, string]> = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? (headers as Array<[string, string]>)
      : Object.entries(headers as Record<string, string>)
  return Object.fromEntries(
    entries.map(([k, v]) => [k, SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? "<redacted>" : v]),
  )
}

const debugFetch: typeof fetch = async (url, init) => {
  console.log("[cluster-client] →", init?.method ?? "GET", url)
  console.log("[cluster-client] headers:", JSON.stringify(redactHeaders(init?.headers)))
  const res = await fetch(url, init)
  console.log("[cluster-client] ←", res.status, res.statusText)
  return res
}

export function getClusterClient(accessToken: string) {
  const config = new Configuration({
    basePath: `${PLATFORM_API_URL}/clusters/${CLUSTER_ID}/proxy`,
    headers: { "x-oauth-access-token": accessToken },
    ...(DEBUG_CLUSTER_CLIENT ? { fetchApi: debugFetch } : {}),
  })
  return {
    datasets: new DatasetsApi(config),
    entries: new EntriesApi(config),
    pipelines: new PipelinesApi(config),
  }
}
