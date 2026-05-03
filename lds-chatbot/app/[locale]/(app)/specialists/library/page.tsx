import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { db, getUserNamesByIds } from "@/lib/db"
import { specialists, mcps } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { BrainCircuit } from "lucide-react"
import { SpecialistsGrid } from "@/components/grids/specialists-grid"

export default async function SpecialistsLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [publicSpecialists, mcpRows, t] = await Promise.all([
    db.query.specialists.findMany({
      where: eq(specialists.isPublic, true),
      orderBy: [desc(specialists.createdAt)],
    }),
    // Names for any MCP referenced by these specialists, regardless of owner —
    // public specialists may reference public MCPs the viewer doesn't own.
    db.select({ id: mcps.id, name: mcps.name }).from(mcps),
    getTranslations("specialists"),
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <SpecialistsGrid
          specialists={publicSpecialists}
          mcpNames={mcpNames}
          authorNames={authorNames}
        />
      )}
    </div>
  )
}
