import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"

export interface AvailableMcp {
  id: string
  name: string
  description: string | null
  category: string | null
  source: "builtin" | "user"
}

// MCPs that are bootstrapped via `scripts/seed-mcps.mjs`. The chatbot UI
// surfaces these under a curated "Legal" section; everything else (whether
// seeded or user-created) shows up under "User MCPs". The split is purely
// presentational — both source rows live in the same `mcps` table.
const BUILTIN_MCP_IDS = new Set(["legifrance", "convention-collective"])

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await db
    .select()
    .from(mcps)
    .where(eq(mcps.enabled, true))
    .orderBy(desc(mcps.createdAt))

  const all: AvailableMcp[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    source: BUILTIN_MCP_IDS.has(r.id) ? "builtin" : "user",
  }))

  const legal = all.filter((m) => m.source === "builtin" && m.category === "legal")
  const otherBuiltin = all.filter((m) => m.source === "builtin" && m.category !== "legal")
  const userMcps = all.filter((m) => m.source === "user")

  return Response.json({ legal, otherBuiltin, userMcps })
}
