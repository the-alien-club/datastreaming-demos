import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getUserNamesByIds, prisma } from "@/lib/db"
import { getUserOrgRole } from "@/lib/platform/onboarding"
import { getAllPublicSpecialists } from "@/models/specialists/queries"
import { mcpNameRow } from "@/models/mcps/schema"
import { BrainCircuit } from "lucide-react"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { LayoutSpecialistsGrid } from "@/components/layouts/specialists/grid"

export default async function SpecialistsLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicSpecialists, mcpRows, t, orgRole] = await Promise.all([
    getAllPublicSpecialists(),
    // Names for any MCP referenced by these specialists, regardless of owner —
    // public specialists may reference public MCPs the viewer doesn't own.
    prisma.mcp.findMany({ ...mcpNameRow }),
    getTranslations("specialists.page"),
    getUserOrgRole(session.user.id),
  ])
  const mcpNames = Object.fromEntries(mcpRows.map((m) => [m.id, m.name]))
  const creatorMap = await getUserNamesByIds(publicSpecialists.map((s) => s.userId))
  const authorNames = Object.fromEntries(creatorMap.entries())

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("libraryTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("librarySubtitle")}</p>
      </div>

      {publicSpecialists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <BrainCircuit className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t("noPublicSpecialists")}</p>
          {orgRole !== "org-client" && (
            <Button asChild variant="outline">
              <Link href="/specialists/new">{t("createFirst")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <LayoutSpecialistsGrid
          specialists={publicSpecialists}
          mcpNames={mcpNames}
          authorNames={authorNames}
          forkable={orgRole !== "org-client"}
        />
      )}
    </div>
  )
}
