import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { getAiModels } from "@/lib/platform/client"
import { getSpecialist } from "@/models/specialists/queries"
import { getMcps } from "@/models/mcps/queries"
import { SpecialistDetailClient, type SpecialistRecord } from "./client"

export default async function SpecialistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const specialist = await getSpecialist(id, session.user.id)
  if (!specialist) notFound()

  const [models, mcpRows] = await Promise.all([
    resolveAccessToken(session.user.id)
      .then((token) => getAiModels(token))
      .catch(() => []),
    getMcps(session.user.id).catch(() => []),
  ])

  const initialSpecialist: SpecialistRecord = {
    id: specialist.id,
    name: specialist.name,
    description: specialist.description ?? null,
    systemPrompt: specialist.systemPrompt,
    model: specialist.model ?? null,
    mcpIds: specialist.mcpIds ?? null,
    isForkable: specialist.isForkable,
  }

  const initialMcpList = mcpRows
    .filter((m) => m.isOwn)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description ?? null,
      category: Array.isArray(m.categories) && m.categories.length > 0
        ? (m.categories as string[])[0]
        : null,
    }))

  return (
    <SpecialistDetailClient
      initialSpecialist={initialSpecialist}
      initialModels={models}
      initialMcpList={initialMcpList}
    />
  )
}
