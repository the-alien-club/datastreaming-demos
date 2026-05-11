import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma, getUserNamesByIds } from "@/lib/db"
import { Bot } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LayoutAgentsGrid } from "@/components/layouts/agents/grid"

export default async function AgentLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicAgents, t] = await Promise.all([
    prisma.agent.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      include: { subagents: true },
    }),
    getTranslations("agents"),
  ])
  const creatorMap = await getUserNamesByIds(publicAgents.map((a) => a.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("librarySubtitle")}</p>
      </div>

      {publicAgents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("noPublicAgents")}</p>
          </CardContent>
        </Card>
      ) : (
        <LayoutAgentsGrid agents={publicAgents} authorNames={authorNames} />
      )}
    </div>
  )
}
