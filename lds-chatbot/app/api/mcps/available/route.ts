import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { ok, unauthorized } from "@/lib/api-response"

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
//
// Seeded ids follow the `<slug>:<userId>` shape (one built-in per user) — we
// match by slug prefix so any user of the system gets the curated list.
const BUILTIN_MCP_SLUGS = new Set(["legifrance", "convention-collective"])

function builtinSlug(id: string): string | null {
  const colon = id.indexOf(":")
  if (colon < 0) return null
  const slug = id.slice(0, colon)
  return BUILTIN_MCP_SLUGS.has(slug) ? slug : null
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const rows = await db
    .select()
    .from(mcps)
    .where(and(eq(mcps.enabled, true), eq(mcps.userId, session.user.id)))
    .orderBy(desc(mcps.createdAt))

  const all: AvailableMcp[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    source: builtinSlug(r.id) !== null ? "builtin" : "user",
  }))

  const legal = all.filter((m) => m.source === "builtin" && m.category === "legal")
  const otherBuiltin = all.filter((m) => m.source === "builtin" && m.category !== "legal")
  const userMcps = all.filter((m) => m.source === "user")

  return ok({ legal, otherBuiltin, userMcps })
}
