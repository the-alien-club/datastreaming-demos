import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserNamesByIds } from "@/lib/db"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import { getAllPublicAgents } from "@/models/agents/queries"
import { AgentLibraryClient } from "./client"

export default async function AgentLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicAgents, orgRole] = await Promise.all([
    getAllPublicAgents(),
    getUserOrgRole(session.user.id),
  ])
  const creatorMap = await getUserNamesByIds(publicAgents.map((a) => a.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return (
    <AgentLibraryClient
      initialAgents={publicAgents}
      initialAuthorNames={authorNames}
      forkable={orgRole !== "org-client"}
    />
  )
}
