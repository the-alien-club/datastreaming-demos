import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { WizardStartProvider } from "@/components/wizards/agents/start/wizard-context"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  return (
    <WizardStartProvider>
      <div className="flex h-dvh">
        <AppSidebar user={session.user} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </WizardStartProvider>
  )
}
