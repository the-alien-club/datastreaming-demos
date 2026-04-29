import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import NewSpecialistForm from "./new-specialist-form"

export default async function NewSpecialistPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  return <NewSpecialistForm />
}
