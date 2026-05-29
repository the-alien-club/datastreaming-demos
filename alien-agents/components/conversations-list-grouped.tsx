"use client"

import { Link } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Bot, MessageSquare } from "lucide-react"
import { dateGroup, timeAgo, type TimeInput } from "@/lib/time"
import { DeleteCardAction } from "@/components/delete-card-action"

export type ConversationRow = {
  id: string
  agentId: string
  agentName: string | null
  title: string | null
  updatedAt: TimeInput
  messageCount: number
}

/**
 * Date-bucketed conversations list. Used by:
 *   - /conversations (global, includes agent name on each row)
 *   - /agents/[id] (per-assistant, omits agent name)
 *
 * Pure rendering — caller fetches the rows and passes them in. The shared
 * `dateGroup` / `timeAgo` helpers accept Date | string | number, so this
 * works whether the rows came from a server component (Date objects) or a
 * client `fetch` (serialized strings).
 */
export function ConversationsListGrouped({
  rows,
  showAgentName = true,
}: {
  rows: ConversationRow[]
  showAgentName?: boolean
}) {
  const t = useTranslations("conversations")

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">{t("empty")}</p>
        <p className="text-xs mt-1 opacity-70">{t("emptyHint")}</p>
      </div>
    )
  }

  const groups: Record<"today" | "yesterday" | "older", ConversationRow[]> = {
    today: [],
    yesterday: [],
    older: [],
  }
  for (const row of rows) {
    groups[dateGroup(row.updatedAt)].push(row)
  }
  const orderedGroups = ["today", "yesterday", "older"] as const

  return (
    <div className="space-y-6">
      {orderedGroups.map((group) => {
        const groupRows = groups[group]
        if (groupRows.length === 0) return null
        return (
          <div key={group}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t(group)}
            </h2>
            <div className="space-y-1">
              {groupRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <Link
                    href={`/agents/${row.agentId}/chat/${row.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {row.title ?? t("untitled")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {showAgentName && (row.agentName ?? t("unknownAgent"))}
                        {row.messageCount > 0 && (
                          <span className={showAgentName ? "ml-2 opacity-60" : "opacity-60"}>
                            {t("messagesCount", { count: row.messageCount })}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100">
                      {timeAgo(row.updatedAt)}
                    </span>
                  </Link>
                  <DeleteCardAction
                    resource="conversation"
                    name={row.title ?? t("untitled")}
                    endpoint={`/api/conversations/${row.id}`}
                    variant="ghost-link"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
