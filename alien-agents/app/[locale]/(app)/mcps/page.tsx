import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import { getMcps } from "@/models/mcps/queries"
import { McpsClient } from "./client"
import type { McpRecord } from "@/components/cards/mcps/mcp"

export default async function McpsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  const rows = await getMcps(session.user.id)

  // Coerce Drizzle Date objects to the epoch-ms numbers McpRecord expects.
  const initialMcps: McpRecord[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    serverUrl: r.serverUrl,
    transport: r.transport ?? null,
    authToken: r.authToken ?? null,
    description: r.description ?? null,
    categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
    type: r.type ?? null,
    provider: r.provider ?? null,
    pricePerQuery: r.pricePerQuery ?? null,
    enabled: r.enabled ?? null,
    isPublic: r.isPublic ?? false,
    isOwn: r.isOwn,
    createdAt: r.createdAt ? (r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt) : null,
    updatedAt: r.updatedAt ? (r.updatedAt instanceof Date ? r.updatedAt.getTime() : r.updatedAt) : null,
  }))

  return <McpsClient initialMcps={initialMcps} />
}
