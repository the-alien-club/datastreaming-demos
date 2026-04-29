import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db } from "@/lib/db"
import { specialists, mcps } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BrainCircuit, Globe, Plus, Settings } from "lucide-react"
import { DeleteCardAction } from "@/components/delete-card-action"
import { PublishCardAction } from "@/components/publish-card-action"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export default async function SpecialistsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [ownSpecialists, publicSpecialists, mcpRows, t] = await Promise.all([
    db.query.specialists.findMany({
      where: eq(specialists.userId, session.user.id),
      orderBy: [desc(specialists.createdAt)],
    }),
    db.query.specialists.findMany({
      where: and(eq(specialists.isPublic, true), ne(specialists.userId, session.user.id)),
      orderBy: [desc(specialists.createdAt)],
    }),
    db.select({ id: mcps.id, name: mcps.name }).from(mcps).where(eq(mcps.userId, session.user.id)),
    getTranslations("specialists"),
  ])
  const specialistList = [
    ...ownSpecialists.map((s) => ({ ...s, isOwn: true })),
    ...publicSpecialists.map((s) => ({ ...s, isOwn: false })),
  ]
  const mcpNames = new Map(mcpRows.map((m) => [m.id, m.name]))
  const tCommon = await getTranslations("common")

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href="/specialists/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("newSpecialist")}
          </Link>
        </Button>
      </div>

      {ownSpecialists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">{t("emptyDescription")}</p>
          <Button asChild>
            <Link href="/specialists/new">
              <Plus className="h-4 w-4 mr-2" />
              {t("createFirst")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ownSpecialists.map((specialist) => {
            const mcpIds: string[] = specialist.mcpIds ? JSON.parse(specialist.mcpIds) : []
            const createdAt = specialist.createdAt
              ? new Date(specialist.createdAt).toLocaleDateString()
              : "—"

            return (
              <Card key={specialist.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{specialist.name}</span>
                    {specialist.isPublic && (
                      <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Public" />
                    )}
                  </CardTitle>
                  {specialist.description && (
                    <CardDescription className="line-clamp-2 text-sm">
                      {specialist.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pb-2 flex-1">
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
                  <p className="text-xs text-muted-foreground mt-2">{t("created", { date: createdAt })}</p>
                </CardContent>
                <CardFooter className="pt-2 gap-2 flex-wrap">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/specialists/${specialist.id}`}>
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      {tCommon("edit")}
                    </Link>
                  </Button>
                  <PublishCardAction
                    resource="specialist"
                    endpoint={`/api/specialists/${specialist.id}`}
                    isPublic={specialist.isPublic}
                  />
                  <DeleteCardAction
                    resource="specialist"
                    name={specialist.name}
                    endpoint={`/api/specialists/${specialist.id}`}
                  />
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {publicSpecialists.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t("publicSection")}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicSpecialists.map((specialist) => {
              const mcpIds: string[] = specialist.mcpIds ? JSON.parse(specialist.mcpIds) : []
              const createdAt = specialist.createdAt
                ? new Date(specialist.createdAt).toLocaleDateString()
                : "—"

              return (
                <Card key={specialist.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{specialist.name}</span>
                      <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Public" />
                    </CardTitle>
                    {specialist.description && (
                      <CardDescription className="line-clamp-2 text-sm">
                        {specialist.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pb-2 flex-1">
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
                    <p className="text-xs text-muted-foreground mt-2">{t("created", { date: createdAt })}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
