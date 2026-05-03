import { Link } from "@/i18n/routing"
import { useFormatter, useTranslations } from "next-intl"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, MessageSquare, Settings } from "lucide-react"
import { PrivacyBadge } from "@/components/privacy-badge"
import { PublishCardAction } from "@/components/publish-card-action"
import { DeleteCardAction } from "@/components/delete-card-action"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

/**
 * Minimal data shape needed to render an agent card. Both the "Mes agents"
 * and "Bibliothèque d'agents" pages produce this from `db.query.agents`.
 */
export type AgentCardData = {
  id: string
  name: string
  description: string | null
  model: string | null
  steps: string | null
  subagents: { id: string }[]
  isPublic: boolean
  userId: string
  createdAt: Date | null
}

/**
 * Single source of truth for agent card UI. `editable=true` adds owner
 * actions (Edit / Publish / Delete) alongside the always-visible Chat CTA.
 */
export function AgentCard({
  agent,
  authorName,
  editable = false,
}: {
  agent: AgentCardData
  authorName: string
  editable?: boolean
}) {
  const t = useTranslations("agents")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const steps = agent.steps
    ? (JSON.parse(agent.steps) as { name: string; prompt: string }[])
    : []
  const createdAt = agent.createdAt
    ? format.dateTime(new Date(agent.createdAt), { dateStyle: "medium" })
    : "—"

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-wrap grow w-full">{agent.name}</span>
          <PrivacyBadge isPublic={agent.isPublic} />
        </CardTitle>
        {agent.description && (
          <CardDescription className="line-clamp-2 text-sm">
            {agent.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-end gap-2">
        <Badge variant="secondary" className="text-xs w-fit">
          {agent.model ?? DEFAULT_MODEL_SLUG}
        </Badge>
        <div className="flex flex-wrap gap-1">
          {steps.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {t("stepsCount", { count: steps.length })}
            </Badge>
          )}
          {agent.subagents.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {t("specialistsCount", { count: agent.subagents.length })}
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2 gap-2 flex-wrap">
        <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="text-wrap font-bold">{tCommon("createdBy", { name: authorName })}</span>
          <span className="shrink-0">{t("created", { date: createdAt })}</span>
        </div>
        <div className="flex w-full justify-between gap-2">
          <Button asChild variant="default" size="sm" className="flex-1">
            <Link href={`/agents/${agent.id}/chat`}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              {t("chat")}
            </Link>
          </Button>
          {editable && (
            <>
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
              <DeleteCardAction
                resource="agent"
                name={agent.name}
                endpoint={`/api/agents/${agent.id}`}
              />
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
