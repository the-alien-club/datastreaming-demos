import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { getDatasetDetail } from "@/models/datasets/service"
import { DatasetDetailClient, type DatasetRecord } from "./client"

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const dataset = await getDatasetDetail(id, session.user.id)
  if (!dataset) notFound()

  const initialDataset: DatasetRecord = {
    id: dataset.id,
    clusterDatasetId: dataset.clusterDatasetId,
    name: dataset.name,
    description: dataset.description ?? null,
    aiInstructions: dataset.aiInstructions ?? null,
    status: dataset.status ?? null,
    attachedAgents: dataset.attachedAgents,
  }

  return <DatasetDetailClient initialDataset={initialDataset} />
}
