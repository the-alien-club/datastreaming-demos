import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import { getUserNamesByIds, prisma } from "@/lib/db"
import { getSpecialists } from "@/models/specialists/queries"
import { SpecialistsClient } from "./client"

export default async function SpecialistsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  const [ownSpecialists, mcpRows] = await Promise.all([
    getSpecialists(session.user.id),
    prisma.mcp.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true },
    }),
  ])

  const mcpNames = Object.fromEntries(mcpRows.map((m) => [m.id, m.name]))
  const creatorMap = await getUserNamesByIds(ownSpecialists.map((s) => s.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return (
    <SpecialistsClient
      initialSpecialists={ownSpecialists}
      initialMcpNames={mcpNames}
      initialAuthorNames={authorNames}
    />
  )
}
