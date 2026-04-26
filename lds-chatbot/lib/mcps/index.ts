import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { McpConfig } from "@/lib/platform/workflows"
import staticMcpConfig from "./config.json"

type StaticMcpEntry = {
  type: string
  url: string
  name?: string
  description?: string
  category?: string
}

export async function loadEnabledMcpConfigs(): Promise<McpConfig[]> {
  const staticConfigs: McpConfig[] = Object.entries(
    staticMcpConfig as Record<string, StaticMcpEntry>,
  ).map(([id, entry]) => ({
    id,
    serverUrl: entry.url,
    authToken: null,
  }))

  const dbRows = await db.select().from(mcps).where(eq(mcps.enabled, true))
  const dbConfigs: McpConfig[] = dbRows.map((r) => ({
    id: r.id,
    serverUrl: r.serverUrl,
    authToken: r.authToken ?? null,
  }))

  return [...staticConfigs, ...dbConfigs]
}

export type StaticMcpManifest = Record<string, StaticMcpEntry>
export const STATIC_MCP_CONFIG: StaticMcpManifest =
  staticMcpConfig as StaticMcpManifest
