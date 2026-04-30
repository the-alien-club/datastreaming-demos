import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db, getUserNamesByIds } from "@/lib/db"
import { agents } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Bot, Plus } from "lucide-react"
import { AutoOpenIfEmpty } from "@/components/wizards/agents/start/wizard-context"
import { AgentCard } from "@/components/cards/agent-card"
import { getUserOrgRole } from "@/lib/platform/onboarding"

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents/library")

  const [ownAgents, t, tCommon] = await Promise.all([
    db.query.agents.findMany({
      where: eq(agents.userId, session.user.id),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
    getTranslations("agents"),
    getTranslations("common"),
  ])
  const creatorNames = await getUserNamesByIds(ownAgents.map((a) => a.userId))

  return (
    <div className="p-4 sm:p-6">
      <AutoOpenIfEmpty agentCount={ownAgents.length} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("myTitle")}</h1>
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
          {ownAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              authorName={creatorNames.get(agent.userId) ?? tCommon("unknownAuthor")}
              editable
            />
          ))}
        </div>
      )}
    </div>
  )
}
