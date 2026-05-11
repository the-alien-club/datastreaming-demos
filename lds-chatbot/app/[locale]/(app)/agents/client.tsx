"use client"

import { Link } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Bot, Plus } from "lucide-react"
import { AutoOpenIfEmpty } from "@/components/wizards/agents/start/wizard-context"
import { LayoutAgentsGrid } from "@/components/layouts/agents/grid"
import type { AgentWithSubagents } from "@/models/agents/schema"

type AgentsClientProps = {
  initialAgents: AgentWithSubagents[]
  initialAuthorNames: Record<string, string>
}

export function AgentsClient({ initialAgents, initialAuthorNames }: AgentsClientProps) {
  const t = useTranslations("agents")

  return (
    <div className="p-4 sm:p-6">
      <AutoOpenIfEmpty agentCount={initialAgents.length} />
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

      {initialAgents.length === 0 ? (
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
        <LayoutAgentsGrid agents={initialAgents} authorNames={initialAuthorNames} editable />
      )}
    </div>
  )
}
