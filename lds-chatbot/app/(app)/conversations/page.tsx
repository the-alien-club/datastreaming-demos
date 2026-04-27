import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { agents, conversations, messages } from "@/lib/db/schema"
import { eq, sql, desc } from "drizzle-orm"
import Link from "next/link"
import { MessageSquare, Bot } from "lucide-react"
import { dateGroup, timeAgo } from "@/lib/time"
import { DeleteCardAction } from "@/components/delete-card-action"

export default async function ConversationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const rows = await db
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
    .orderBy(desc(conversations.updatedAt))

  // Group by date
  const groups: Record<string, typeof rows> = { Today: [], Yesterday: [], Older: [] }
  for (const row of rows) {
    const group = dateGroup(row.updatedAt)
    groups[group].push(row)
  }

  const orderedGroups = ["Today", "Yesterday", "Older"] as const

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Conversations</h1>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-base font-medium">No conversations yet</p>
          <p className="text-sm mt-1 opacity-70">
            Start a chat from an agent page to see your history here.
          </p>
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
                  {group}
                </h2>
                <div className="space-y-1">
                  {groupRows.map((row) => (
                    // Wrapper is a div, not a Link, so the trash button can
                    // live as a sibling without nesting interactives. The
                    // Link covers the textual area; the trash sits next to
                    // the timestamp and uses the `ghost-link` variant which
                    // stops click propagation so opening the dialog never
                    // navigates to the chat.
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
                            {row.title ?? "Untitled conversation"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {row.agentName ?? "Unknown agent"}
                            {row.messageCount > 0 && (
                              <span className="ml-2 opacity-60">
                                · {row.messageCount} message{row.messageCount !== 1 ? "s" : ""}
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
                        name={row.title ?? "Untitled conversation"}
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
