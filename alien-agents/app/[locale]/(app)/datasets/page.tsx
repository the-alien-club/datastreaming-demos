import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getDatasetsSummary } from "@/models/datasets/service"
import { DatasetsClient, type DatasetRecord } from "./client"

export default async function DatasetsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")


  const rows = await getDatasetsSummary(session.user.id)

  // Coerce Drizzle Date objects to the epoch-ms numbers the client expects.
  const initialDatasets: DatasetRecord[] = rows.map((r) => ({
    id: r.id,
    clusterDatasetId: r.clusterDatasetId,
    name: r.name,
    description: r.description,
    status: r.status,
    isPublic: r.isPublic ?? false,
    userId: r.userId,
    attachedAgentCount: r.attachedAgentCount,
    createdAt: r.createdAt ? (r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt) : null,
    updatedAt: r.updatedAt ? (r.updatedAt instanceof Date ? r.updatedAt.getTime() : r.updatedAt) : null,
    isOwn: r.isOwn,
  }))

  return <DatasetsClient initialDatasets={initialDatasets} />
}
