import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db, getUserNamesByIds } from "@/lib/db"
import { agents } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, MessageSquare } from "lucide-react"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { PrivacyBadge } from "@/components/privacy-badge"

export default async function AgentLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicAgents, t, tCommon] = await Promise.all([
    db.query.agents.findMany({
      where: eq(agents.isPublic, true),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
    getTranslations("agents"),
    getTranslations("common"),
  ])
  const creatorNames = await getUserNamesByIds(publicAgents.map((a) => a.userId))

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("librarySubtitle")}</p>
      </div>

      {publicAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t("noPublicAgents")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publicAgents.map((agent) => {
            const steps = agent.steps ? JSON.parse(agent.steps) as { name: string; prompt: string }[] : []
            const createdAt = agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—"
            const author = creatorNames.get(agent.userId) ?? tCommon("unknownAuthor")

            return (
              <Card key={agent.id} className="flex flex-col">
                <CardHeader className="pb-2 overflow-hidden">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-wrap">{agent.name}</span>
                    <PrivacyBadge isPublic />
                  </CardTitle>
                  {agent.description && (
                    <CardDescription className="line-clamp-2 text-sm">{agent.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1" />
                <div className="px-6 pb-3 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">{agent.model ?? DEFAULT_MODEL_SLUG}</Badge>
                    {steps.length > 0 && (
                      <Badge variant="outline" className="text-xs">{t("stepsCount", { count: steps.length })}</Badge>
                    )}
                    {agent.subagents.length > 0 && (
                      <Badge variant="outline" className="text-xs">{t("specialistsCount", { count: agent.subagents.length })}</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{tCommon("createdBy", { name: author })}</span>
                    <span className="shrink-0">{t("created", { date: createdAt })}</span>
                  </div>
                </div>
                <CardFooter className="pt-2">
                  <Button asChild variant="default" size="sm" className="flex-1">
                    <Link href={`/agents/${agent.id}/chat`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      {t("chat")}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
