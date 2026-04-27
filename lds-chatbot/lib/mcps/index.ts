import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { McpConfig } from "@/lib/platform/workflows"

// MCP registrations live entirely in the `mcps` table. The legacy
// `lib/mcps/config.json` static manifest has been retired; legal/built-in
// MCPs are seeded via `scripts/seed-mcps.mjs` (idempotent upsert) and from
// then on are managed through the same DB row as user-added entries.
export async function loadEnabledMcpConfigs(): Promise<McpConfig[]> {
  const rows = await db.select().from(mcps).where(eq(mcps.enabled, true))
  return rows.map((r) => ({
    id: r.id,
    serverUrl: r.serverUrl,
    authToken: r.authToken ?? null,
  }))
}
