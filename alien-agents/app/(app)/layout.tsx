import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { ensureOrgMembership, getMe } from "@/lib/platform/onboarding"
import { AppSidebar } from "@/components/app-sidebar"

const ORG_ID = process.env.ORG_ID

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  // If ORG_ID is configured, keep the user pinned to the chatbot org on every
  // page load — guards against manual org switches on the main platform UI.
  if (ORG_ID) {
    try {
      const userToken = await resolveAccessToken(session.user.id)
      const me = await getMe(userToken)

      if (me.currentOrganizationId !== Number(ORG_ID)) {
        await ensureOrgMembership(session.user.id)
      }
    } catch {
      // Non-fatal — user still reaches the app
    }
  }

  return (
    <div className="flex h-dvh">
      <AppSidebar user={session.user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
