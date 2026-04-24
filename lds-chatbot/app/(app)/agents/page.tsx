import Link from "next/link"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { agents } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, Plus, MessageSquare, Settings } from "lucide-react"

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const agentList = await db.query.agents.findMany({
    orderBy: [desc(agents.createdAt)],
    with: { subagents: true },
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">Create and manage your AI agents.</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="h-4 w-4 mr-2" />
            New Agent
          </Link>
        </Button>
      </div>

      {agentList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No agents yet</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Create your first agent to start building AI-powered workflows.
          </p>
          <Button asChild>
            <Link href="/agents/new">
              <Plus className="h-4 w-4 mr-2" />
              Create your first agent
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agentList.map((agent) => {
            const steps = agent.steps ? JSON.parse(agent.steps) as { name: string; prompt: string }[] : []
            const createdAt = agent.createdAt
              ? new Date(agent.createdAt).toLocaleDateString()
              : "—"

            return (
              <Card key={agent.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{agent.name}</span>
                  </CardTitle>
                  {agent.description && (
                    <CardDescription className="line-clamp-2 text-sm">
                      {agent.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pb-2 flex-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {agent.model ?? "mistral-small-latest"}
                    </Badge>
                    {steps.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {steps.length} step{steps.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {agent.subagents.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {agent.subagents.length} specialist{agent.subagents.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Created {createdAt}</p>
                </CardContent>
                <CardFooter className="pt-2 gap-2">
                  <Button asChild variant="default" size="sm" className="flex-1">
                    <Link href={`/agents/${agent.id}/chat`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Chat
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/agents/${agent.id}`}>
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
