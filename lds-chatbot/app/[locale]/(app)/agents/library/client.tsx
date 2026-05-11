"use client"

import { useTranslations } from "next-intl"
import { Bot } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LayoutAgentsGrid } from "@/components/layouts/agents/grid"
import type { AgentCardData } from "@/models/agents/schema"

type AgentLibraryClientProps = {
  initialAgents: AgentCardData[]
  initialAuthorNames: Record<string, string>
  forkable: boolean
}

export function AgentLibraryClient({
  initialAgents,
  initialAuthorNames,
  forkable,
}: AgentLibraryClientProps) {
  const t = useTranslations("agents")

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("librarySubtitle")}</p>
      </div>

      {initialAgents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("noPublicAgents")}</p>
          </CardContent>
        </Card>
      ) : (
        <LayoutAgentsGrid
          agents={initialAgents}
          authorNames={initialAuthorNames}
          forkable={forkable}
        />
      )}
    </div>
  )
}
