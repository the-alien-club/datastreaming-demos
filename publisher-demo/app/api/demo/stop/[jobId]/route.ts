import { NextResponse } from "next/server"
import { jobStore } from "@/lib/claude-sdk/job-store"

export const dynamic = "force-dynamic"

export async function POST(_request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params
  const job = jobStore.get(jobId)
  if (!job) return NextResponse.json({ error: "not-found" }, { status: 404 })
  jobStore.cancel(jobId)
  return NextResponse.json({ jobId, status: "cancelled" })
}
