import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Database } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { type McpRecord } from "@/components/cards/mcps/mcp"
import { LayoutMcpsReadonlyGrid } from "@/components/layouts/mcps/readonly-grid"

export default async function McpLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [rows, t] = await Promise.all([
    prisma.mcp.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
    }),
    getTranslations("mcps"),
  ])

  const records: McpRecord[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    serverUrl: r.serverUrl,
    transport: r.transport,
    authToken: r.authToken,
    description: r.description,
    categories: r.categories ?? [],
    type: r.type,
    provider: r.provider,
    pricePerQuery: r.pricePerQuery,
    enabled: r.enabled,
    isPublic: r.isPublic,
    isOwn: r.userId === session.user.id,
    createdAt: r.createdAt ? r.createdAt.getTime() : null,
    updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
  }))

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("librarySubtitle")}</p>
      </div>

      {records.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">{t("emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <LayoutMcpsReadonlyGrid mcps={records} />
      )}
    </div>
  )
}
