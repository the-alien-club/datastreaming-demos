import Link from "next/link"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { specialists, mcps } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BrainCircuit, Plus, Settings } from "lucide-react"

export default async function SpecialistsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [specialistList, mcpRows] = await Promise.all([
    db.query.specialists.findMany({ orderBy: [desc(specialists.createdAt)] }),
    db.select({ id: mcps.id, name: mcps.name }).from(mcps),
  ])
  const mcpNames = new Map(mcpRows.map((m) => [m.id, m.name]))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Specialists</h1>
          <p className="text-muted-foreground mt-1">
            Reusable specialist agents you can attach to any agent.
          </p>
        </div>
        <Button asChild>
          <Link href="/specialists/new">
            <Plus className="h-4 w-4 mr-2" />
            New Specialist
          </Link>
        </Button>
      </div>

      {specialistList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No specialists yet</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Create reusable specialist agents to attach to your agents.
          </p>
          <Button asChild>
            <Link href="/specialists/new">
              <Plus className="h-4 w-4 mr-2" />
              Create your first specialist
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialistList.map((specialist) => {
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
                      {specialist.model ?? "gpt-4.1-mini"}
                    </Badge>
                    {mcpIds.map((mcpId) => (
                      <Badge key={mcpId} variant="outline" className="text-xs">
                        {mcpNames.get(mcpId) ?? mcpId}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Created {createdAt}</p>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/specialists/${specialist.id}`}>
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
