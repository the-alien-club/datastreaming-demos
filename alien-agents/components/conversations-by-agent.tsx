"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Bot, ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ConversationsListGrouped,
  type ConversationRow,
} from "@/components/conversations-list-grouped"

export type AgentGroup = {
  agentId: string
  agentName: string
  rows: ConversationRow[]
}

export function ConversationsByAgent({ groups }: { groups: AgentGroup[] }) {
  const t = useTranslations("conversations")

  // All expanded by default. State is keyed by agentId so toggling one
  // doesn't collapse the others.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const open = !collapsed.has(group.agentId)
        return (
          <Collapsible
            key={group.agentId}
            open={open}
            onOpenChange={() => toggle(group.agentId)}
            className="border rounded-lg"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <Link
                href={`/agents/${group.agentId}`}
                className="inline-flex items-center gap-2 group/agent min-w-0"
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <h2 className="text-base font-semibold truncate group-hover/agent:underline underline-offset-4">
                  {group.agentName}
                </h2>
                <span className="text-xs text-muted-foreground shrink-0">
                  · {t("conversationsCount", { count: group.rows.length })}
                </span>
              </Link>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={open ? t("collapse") : t("expand")}
                  className="rounded-md p-1.5 hover:bg-muted transition-colors shrink-0"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
                  />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="border-t px-2 py-3">
              <ConversationsListGrouped rows={group.rows} showAgentName={false} />
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
