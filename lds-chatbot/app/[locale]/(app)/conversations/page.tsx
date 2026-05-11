import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getConversations } from "@/models/conversations/service"
import { MessageSquare } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { type ConversationRow } from "@/components/conversations-list-grouped"
import {
  ConversationsByAgent,
  type AgentGroup,
} from "@/components/conversations-by-agent"

export default async function ConversationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [summaries, t] = await Promise.all([
    getConversations(session.user.id),
    getTranslations("conversations"),
  ])

  // Date → epoch ms so values survive server→client serialization (the
  // shared time helpers accept Date | string | number).
  const serializable: ConversationRow[] = summaries.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    title: r.title,
    updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
    messageCount: r.messageCount,
  }))

  // Group by assistant. Order preserved from the DB query (most-recent
  // updated_at first), so the assistant you used last surfaces at the top.
  const groupsMap = new Map<string, AgentGroup>()
  for (const row of serializable) {
    const existing = groupsMap.get(row.agentId)
    if (existing) {
      existing.rows.push(row)
    } else {
      groupsMap.set(row.agentId, {
        agentId: row.agentId,
        agentName: row.agentName ?? t("unknownAgent"),
        rows: [row],
      })
    }
  }
  const groups = Array.from(groupsMap.values())

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-base font-medium">{t("empty")}</p>
            <p className="text-sm mt-1 opacity-70">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <ConversationsByAgent groups={groups} />
      )}
    </div>
  )
}
