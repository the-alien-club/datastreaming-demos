import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import type { McpConfig } from "@/lib/platform/workflows"

// MCP registrations live entirely in the `mcps` table. The legacy
// `lib/mcps/config.json` static manifest has been retired; legal/built-in
// MCPs are seeded via `scripts/seed-mcps.mjs` (idempotent upsert) and from
// then on are managed through the same DB row as user-added entries.
//
// Scoped to a single user: every MCP row is owned (FK ON DELETE CASCADE) so
// callers must pass the session's user id. Cross-user MCPs are not possible
// by design — built-in entries are seeded per-user during sign-up bootstrap.
export async function loadEnabledMcpConfigs(userId: string): Promise<McpConfig[]> {
  const rows = await db
    .select()
    .from(mcps)
    .where(and(eq(mcps.enabled, true), eq(mcps.userId, userId)))
  return rows.map((r) => ({
    id: r.id,
    serverUrl: r.serverUrl,
    authToken: r.authToken ?? null,
  }))
}
