import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import NewAgentForm from "./new-agent-form"

export default async function NewAgentPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  return <NewAgentForm />
}
