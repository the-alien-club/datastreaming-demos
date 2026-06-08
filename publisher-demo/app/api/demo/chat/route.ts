import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { processQuery } from "@/lib/claude-sdk/agent-query"
import { jobStore } from "@/lib/claude-sdk/job-store"
import { env } from "@/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  mode: "data" | "agentic"
  messages: Array<{ role: "user" | "assistant"; content: string }>
  model?: string
}

/**
 * Mode A (agentic) — streams the platform workflow's Responses API via the
 * Vercel AI SDK pattern. Not yet wired in this scaffold; returns 501 with the
 * exact upstream URL the caller should hit so the limitation is explicit.
 *
 * Mode B (data) — Claude Agent SDK + mcp-alien. Starts a background job and
 * returns { jobId } for /api/demo/status/[jobId] polling.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Body
  if (!body || !body.mode || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  if (body.mode === "data") {
    const jobId = nanoid()
    jobStore.create(jobId)
    void processQuery(jobId, body.messages, body.model ?? "claude-opus-4-7")
    return NextResponse.json({ jobId, status: "started" })
  }

  if (body.mode === "agentic") {
    return NextResponse.json(
      {
        error: "agentic-mode-not-wired",
        message:
          "Mode A (Agentic flow) streaming is not yet wired in this scaffold. " +
          "It will forward to the platform's Responses API; in the meantime the " +
          "demo's scripted runner handles Agentic flow visually.",
        upstream: `${env.PLATFORM_API_URL}/agent/${env.DEMO_WORKFLOW_ID}/responses`,
      },
      { status: 501 },
    )
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 })
}
