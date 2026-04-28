import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { eq, sql, desc } from "drizzle-orm"
import { MessageSquare, Bot } from "lucide-react"
import { dateGroup } from "@/lib/time"
import { timeAgo } from "@/lib/time"
import { DeleteCardAction } from "@/components/delete-card-action"

export default async function ConversationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [rows, t] = await Promise.all([
    db
      .select({
        id: conversations.id,
        agentId: conversations.agentId,
        agentName: agents.name,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        messageCount: sql<number>`count(${messages.id})`.mapWith(Number),
      })
      .from(conversations)
      .leftJoin(agents, eq(conversations.agentId, agents.id))
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.userId, session.user.id))
      .groupBy(
        conversations.id,
        conversations.agentId,
        conversations.title,
        conversations.updatedAt,
        agents.name,
      )
      .orderBy(desc(conversations.updatedAt)),
    getTranslations("conversations"),
  ])

  // Group by date using locale-neutral keys
  const groups: Record<"today" | "yesterday" | "older", typeof rows> = {
    today: [],
    yesterday: [],
    older: [],
  }
  for (const row of rows) {
    const group = dateGroup(row.updatedAt)
    groups[group].push(row)
  }

  const orderedGroups = ["today", "yesterday", "older"] as const

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-base font-medium">{t("empty")}</p>
          <p className="text-sm mt-1 opacity-70">{t("emptyHint")}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-8">
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
                            {row.agentName ?? t("unknownAgent")}
                            {row.messageCount > 0 && (
                              <span className="ml-2 opacity-60">
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
      )}
    </div>
  )
}
