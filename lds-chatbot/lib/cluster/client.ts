import { Configuration, DatasetsApi, EntriesApi, PipelinesApi } from "@alien/data-api-client"

const PLATFORM_API_URL = process.env.PLATFORM_API_URL!
const CLUSTER_ID = process.env.CLUSTER_ID!

export function getClusterClient(accessToken: string) {
  const debugFetch: typeof fetch = async (url, init) => {
    console.log("[cluster-client] →", init?.method ?? "GET", url)
    console.log("[cluster-client] headers:", JSON.stringify(init?.headers ?? {}))
    const res = await fetch(url, init)
    console.log("[cluster-client] ←", res.status, res.statusText)
    return res
  }

  const config = new Configuration({
    basePath: `${PLATFORM_API_URL}/clusters/${CLUSTER_ID}/proxy`,
    headers: { "x-oauth-access-token": accessToken },
    fetchApi: debugFetch,
  })
  return {
    datasets: new DatasetsApi(config),
    entries: new EntriesApi(config),
    pipelines: new PipelinesApi(config),
  }
}
