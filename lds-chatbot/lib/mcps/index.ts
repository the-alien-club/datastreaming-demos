import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, eq, ne, or } from "drizzle-orm"
import type { McpConfig } from "@/lib/platform/workflows"

// MCP registrations live entirely in the `mcps` table. The legacy
// `lib/mcps/config.json` static manifest has been retired; legal/built-in
// MCPs are seeded via `scripts/seed-mcps.mjs` (idempotent upsert) and from
// then on are managed through the same DB row as user-added entries.
//
// Returns enabled MCPs owned by this user PLUS enabled public MCPs from other
// users so that workflow graphs built for this user can reference shared MCPs.
export async function loadEnabledMcpConfigs(userId: string): Promise<McpConfig[]> {
  const rows = await db
    .select()
    .from(mcps)
    .where(
      and(
        eq(mcps.enabled, true),
        or(eq(mcps.userId, userId), and(eq(mcps.isPublic, true), ne(mcps.userId, userId))),
      ),
    )
  return rows.map((r) => ({
    id: r.id,
    serverUrl: r.serverUrl,
    authToken: r.authToken ?? null,
  }))
}
