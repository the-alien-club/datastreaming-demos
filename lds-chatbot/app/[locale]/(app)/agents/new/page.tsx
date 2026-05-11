import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { getAiModels } from "@/lib/platform/client"
import { AgentNewClient } from "./client"

export default async function NewAgentPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  const models = await resolveAccessToken(session.user.id)
    .then((token) => getAiModels(token))
    .catch(() => [])

  return <AgentNewClient initialModels={models} />
}
