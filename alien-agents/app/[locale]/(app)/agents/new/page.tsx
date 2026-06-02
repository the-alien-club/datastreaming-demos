import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { getAiModels } from "@/lib/platform/client"
import { AgentNewClient } from "./client"

export default async function NewAgentPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")


  const models = await resolveAccessToken(session.user.id)
    .then((token) => getAiModels(token))
    .catch(() => [])

  return <AgentNewClient initialModels={models} />
}
