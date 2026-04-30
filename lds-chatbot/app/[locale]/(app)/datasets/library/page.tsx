import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { db } from "@/lib/db"
import { datasets, agentSubagents } from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { Database } from "lucide-react"
import { DatasetRow, type DatasetRowData } from "@/components/cards/dataset-row"

export default async function CorpusLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicRows, t] = await Promise.all([
    db
      .select({
        id: datasets.id,
        name: datasets.name,
        description: datasets.description,
        status: datasets.status,
        isPublic: datasets.isPublic,
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

  const rows: DatasetRowData[] = publicRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    isPublic: r.isPublic,
    attachedAgentCount: Number(r.attachedAgentCount),
    createdAt: r.createdAt ? r.createdAt.getTime() : null,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("librarySubtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((dataset) => (
            <DatasetRow key={dataset.id} dataset={dataset} />
          ))}
        </div>
      )}
    </div>
  )
}
