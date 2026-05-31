import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { getAiModels } from "@/lib/platform/client"
import { getMcps } from "@/models/mcps/queries"
import { SpecialistNewClient } from "./client"

export default async function NewSpecialistPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")


  const [models, mcpRows] = await Promise.all([
    resolveAccessToken(session.user.id)
      .then((token) => getAiModels(token))
      .catch(() => []),
    getMcps(session.user.id).catch(() => []),
  ])

  const initialMcps = mcpRows
    .filter((m) => m.isOwn)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description ?? null,
      category: Array.isArray(m.categories) && m.categories.length > 0
        ? (m.categories as string[])[0]
        : null,
    }))

  return <SpecialistNewClient initialModels={models} initialMcps={initialMcps} />
}
