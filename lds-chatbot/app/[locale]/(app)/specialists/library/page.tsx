import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { db, getUserNamesByIds } from "@/lib/db"
import { specialists, mcps } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BrainCircuit } from "lucide-react"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { PrivacyBadge } from "@/components/privacy-badge"

export default async function SpecialistsLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicSpecialists, mcpRows, t, tCommon] = await Promise.all([
    db.query.specialists.findMany({
      where: eq(specialists.isPublic, true),
      orderBy: [desc(specialists.createdAt)],
    }),
    // Names for any MCP referenced by these specialists, regardless of owner —
    // public specialists may reference public MCPs the viewer doesn't own.
    db.select({ id: mcps.id, name: mcps.name }).from(mcps),
    getTranslations("specialists"),
    getTranslations("common"),
  ])
  const mcpNames = new Map(mcpRows.map((m) => [m.id, m.name]))
  const creatorNames = await getUserNamesByIds(publicSpecialists.map((s) => s.userId))

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("librarySubtitle")}</p>
      </div>

      {publicSpecialists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publicSpecialists.map((specialist) => {
            const mcpIds: string[] = specialist.mcpIds ? JSON.parse(specialist.mcpIds) : []
            const createdAt = specialist.createdAt
              ? new Date(specialist.createdAt).toLocaleDateString()
              : "—"
            const author = creatorNames.get(specialist.userId) ?? tCommon("unknownAuthor")

            return (
              <Card key={specialist.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{specialist.name}</span>
                    <PrivacyBadge isPublic />
                  </CardTitle>
                  {specialist.description && (
                    <CardDescription className="line-clamp-2 text-sm">
                      {specialist.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1" />
                <div className="px-6 pb-4 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {specialist.model ?? DEFAULT_MODEL_SLUG}
                    </Badge>
                    {mcpIds.map((mcpId) => (
                      <Badge key={mcpId} variant="outline" className="text-xs">
                        {mcpNames.get(mcpId) ?? mcpId}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{tCommon("createdBy", { name: author })}</span>
                    <span className="shrink-0">{t("created", { date: createdAt })}</span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
