import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserNamesByIds } from "@/lib/db"
import { getAgents } from "@/models/agents/queries"
import { AgentsClient } from "./client"

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")


  const ownAgents = await getAgents(session.user.id)
  const creatorMap = await getUserNamesByIds(ownAgents.map((a) => a.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return <AgentsClient initialAgents={ownAgents} initialAuthorNames={authorNames} />
}
