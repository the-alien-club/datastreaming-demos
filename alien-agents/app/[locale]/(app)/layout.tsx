import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { WizardStartProvider } from "@/components/wizards/agents/start/wizard-context"
import { getUserOrgRole } from "@/lib/platform/onboarding"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  const isOrgClient = orgRole === "org-client"

  return (
    <WizardStartProvider>
      <div className="flex h-dvh">
        <AppSidebar user={session.user} isOrgClient={isOrgClient} />
        <main className="flex-1 overflow-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </WizardStartProvider>
  )
}
