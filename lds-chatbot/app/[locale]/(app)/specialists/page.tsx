import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { db, getUserNamesByIds } from "@/lib/db"
import { specialists, mcps } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { BrainCircuit, Plus } from "lucide-react"
import { SpecialistsGrid } from "@/components/grids/specialists-grid"
import { getUserOrgRole } from "@/lib/platform/onboarding"

export default async function SpecialistsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orgRole = await getUserOrgRole(session.user.id)
  if (orgRole === "org-client") redirect("/agents")

  const [ownSpecialists, mcpRows, t] = await Promise.all([
    db.query.specialists.findMany({
      where: eq(specialists.userId, session.user.id),
      orderBy: [desc(specialists.createdAt)],
    }),
    db.select({ id: mcps.id, name: mcps.name }).from(mcps).where(eq(mcps.userId, session.user.id)),
    getTranslations("specialists"),
  ])
  const mcpNames = Object.fromEntries(mcpRows.map((m) => [m.id, m.name]))
  const creatorMap = await getUserNamesByIds(ownSpecialists.map((s) => s.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("myTitle")}</h1>
          <p className="text-muted-foreground mt-1">{t("mySubtitle")}</p>
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
        <SpecialistsGrid
          specialists={ownSpecialists}
          mcpNames={mcpNames}
          authorNames={authorNames}
          editable
        />
      )}
    </div>
  )
}
