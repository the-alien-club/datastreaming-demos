import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db } from "@/lib/db"
import { agents } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, Globe, Plus, MessageSquare, Settings } from "lucide-react"
import { AutoOpenIfEmpty } from "@/components/wizards/agents/start/wizard-context"
import { DeleteCardAction } from "@/components/delete-card-action"
import { PublishCardAction } from "@/components/publish-card-action"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { getUserOrgRole } from "@/lib/platform/onboarding"

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  const isOrgClient = orgRole === "org-client"

  const [ownAgents, publicAgents, t, tCommon] = await Promise.all([
    isOrgClient
      ? Promise.resolve([])
      : db.query.agents.findMany({
        where: eq(agents.userId, session.user.id),
        orderBy: [desc(agents.createdAt)],
        with: { subagents: true },
      }),
    db.query.agents.findMany({
      where: and(eq(agents.isPublic, true), ne(agents.userId, session.user.id)),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
    getTranslations("agents"),
    getTranslations("common"),
  ])

  // org_client: show only public agents as the primary list
  if (isOrgClient) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
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

              return (
                <Card key={agent.id} className="flex flex-col">
                  <CardHeader className="pb-2 overflow-hidden">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-wrap">{agent.name}</span>
                    </CardTitle>
                    {agent.description && (
                      <CardDescription className="line-clamp-2 text-sm">{agent.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pb-2 flex-1">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">{agent.model ?? DEFAULT_MODEL_SLUG}</Badge>
                      {steps.length > 0 && (
                        <Badge variant="outline" className="text-xs">{t("stepsCount", { count: steps.length })}</Badge>
                      )}
                      {agent.subagents.length > 0 && (
                        <Badge variant="outline" className="text-xs">{t("specialistsCount", { count: agent.subagents.length })}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t("created", { date: createdAt })}</p>
                  </CardContent>
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

  // Full view for org_admin / org_owner and unconfigured installs
  return (
    <div className="p-4 sm:p-6">
      <AutoOpenIfEmpty agentCount={ownAgents.length} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href="/agents/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("newAgent")}
          </Link>
        </Button>
      </div>

      {ownAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">{t("emptyDescription")}</p>
          <Button asChild>
            <Link href="/agents/new">
              <Plus className="h-4 w-4 mr-2" />
              {t("createFirst")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ownAgents.map((agent) => {
            const steps = agent.steps ? JSON.parse(agent.steps) as { name: string; prompt: string }[] : []
            const createdAt = agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—"

            return (
              <Card key={agent.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{agent.name}</span>
                    {agent.isPublic && (
                      <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Public" />
                    )}
                  </CardTitle>
                  {agent.description && (
                    <CardDescription className="line-clamp-2 text-sm">{agent.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pb-2 flex-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">{agent.model ?? DEFAULT_MODEL_SLUG}</Badge>
                    {steps.length > 0 && (
                      <Badge variant="outline" className="text-xs">{t("stepsCount", { count: steps.length })}</Badge>
                    )}
                    {agent.subagents.length > 0 && (
                      <Badge variant="outline" className="text-xs">{t("specialistsCount", { count: agent.subagents.length })}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{t("created", { date: createdAt })}</p>
                </CardContent>
                <CardFooter className="pt-2 gap-2 flex-wrap">
                  <Button asChild variant="default" size="sm" className="flex-1">
                    <Link href={`/agents/${agent.id}/chat`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      {t("chat")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/agents/${agent.id}`}>
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      {tCommon("edit")}
                    </Link>
                  </Button>
                  <PublishCardAction
                    resource="agent"
                    endpoint={`/api/agents/${agent.id}`}
                    isPublic={agent.isPublic}
                  />
                  <DeleteCardAction resource="agent" name={agent.name} endpoint={`/api/agents/${agent.id}`} />
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {publicAgents.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t("publicSection")}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicAgents.map((agent) => {
              const steps = agent.steps ? JSON.parse(agent.steps) as { name: string; prompt: string }[] : []
              const createdAt = agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—"

              return (
                <Card key={agent.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{agent.name}</span>
                      <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Public" />
                    </CardTitle>
                    {agent.description && (
                      <CardDescription className="line-clamp-2 text-sm">{agent.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pb-2 flex-1">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">{agent.model ?? DEFAULT_MODEL_SLUG}</Badge>
                      {steps.length > 0 && (
                        <Badge variant="outline" className="text-xs">{t("stepsCount", { count: steps.length })}</Badge>
                      )}
                      {agent.subagents.length > 0 && (
                        <Badge variant="outline" className="text-xs">{t("specialistsCount", { count: agent.subagents.length })}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{t("created", { date: createdAt })}</p>
                  </CardContent>
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
        </>
      )}
    </div>
  )
}
