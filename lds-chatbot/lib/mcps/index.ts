import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { McpConfig } from "@/lib/platform/workflows"

export async function loadEnabledMcpConfigs(): Promise<McpConfig[]> {
  const rows = await db.select().from(mcps).where(eq(mcps.enabled, true))
  return rows.map((r) => ({
    id: r.id,
    serverUrl: r.serverUrl,
    authToken: r.authToken ?? null,
  }))
}
