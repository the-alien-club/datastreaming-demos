import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcps } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import staticMcpConfig from "@/lib/mcps/config.json"

export interface AvailableMcp {
  id: string
  name: string
  description: string | null
  category: string | null
  source: "builtin" | "user"
}

interface StaticMcpEntry {
  type: string
  url: string
  name: string
  description?: string
  category?: string
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const builtin: AvailableMcp[] = Object.entries(staticMcpConfig as Record<string, StaticMcpEntry>).map(
    ([id, entry]) => ({
      id,
      name: entry.name,
      description: entry.description ?? null,
      category: entry.category ?? null,
      source: "builtin",
    }),
  )

  const userRows = await db
    .select()
    .from(mcps)
    .where(eq(mcps.enabled, true))
    .orderBy(desc(mcps.createdAt))

  const userMcps: AvailableMcp[] = userRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    source: "user",
  }))

  const legal = builtin.filter((m) => m.category === "legal")
  const otherBuiltin = builtin.filter((m) => m.category !== "legal")

  return Response.json({
    legal,
    otherBuiltin,
    userMcps,
  })
}
