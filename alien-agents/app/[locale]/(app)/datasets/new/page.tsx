import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { DatasetNewClient } from "./client"

export default async function NewDatasetPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")


  return <DatasetNewClient />
}
