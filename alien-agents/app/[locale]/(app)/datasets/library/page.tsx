import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Database } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { type DatasetRowData } from "@/components/cards/datasets/row"
import { LayoutDatasetsReadonlyGrid } from "@/components/layouts/datasets/readonly-grid"

export default async function CorpusLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicDatasets, t] = await Promise.all([
    prisma.dataset.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { agentSubagents: true } } },
    }),
    getTranslations("datasets"),
  ])

  const rows: DatasetRowData[] = publicDatasets.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    isPublic: r.isPublic,
    attachedAgentCount: r._count.agentSubagents,
    createdAt: r.createdAt ? r.createdAt.getTime() : null,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("librarySubtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">{t("emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <LayoutDatasetsReadonlyGrid datasets={rows} />
      )}
    </div>
  )
}
