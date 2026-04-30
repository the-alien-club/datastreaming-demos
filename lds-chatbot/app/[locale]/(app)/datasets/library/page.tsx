import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { db } from "@/lib/db"
import { datasets, agentSubagents } from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { Badge } from "@/components/ui/badge"
import { Database } from "lucide-react"
import { timeAgo } from "@/lib/time"
import { PrivacyBadge } from "@/components/privacy-badge"

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending"
  if (s === "ready")
    return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">ready</Badge>
  if (s === "processing")
    return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">processing</Badge>
  if (s === "error")
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">error</Badge>
  return <Badge variant="secondary">{s}</Badge>
}

export default async function CorpusLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicDatasets, t] = await Promise.all([
    db
      .select({
        id: datasets.id,
        name: datasets.name,
        description: datasets.description,
        status: datasets.status,
        createdAt: datasets.createdAt,
        attachedAgentCount: sql<number>`count(distinct ${agentSubagents.agentId})`,
      })
      .from(datasets)
      .leftJoin(agentSubagents, eq(agentSubagents.datasetId, datasets.id))
      .where(eq(datasets.isPublic, true))
      .groupBy(datasets.id)
      .orderBy(desc(datasets.createdAt)),
    getTranslations("datasets"),
  ])

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("librarySubtitle")}</p>
      </div>

      {publicDatasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publicDatasets.map((dataset) => (
            <div
              key={dataset.id}
              className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
            >
              <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{dataset.name}</p>
                  <StatusBadge status={dataset.status} />
                  <PrivacyBadge isPublic />
                  {Number(dataset.attachedAgentCount) > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {t("agentsCount", { count: Number(dataset.attachedAgentCount) })}
                    </Badge>
                  )}
                </div>
                {dataset.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dataset.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(dataset.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
