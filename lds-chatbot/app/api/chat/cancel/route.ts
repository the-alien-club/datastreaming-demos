import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { resolveAccessToken } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { agents } from "@/lib/db/schema"
import { badRequest, notFound, unauthorized } from "@/lib/api-response"

export const dynamic = "force-dynamic"

const PLATFORM_API_URL = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "")

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return unauthorized()

  const token = await resolveAccessToken(session.user.id)
  if (!token) return unauthorized()

  const body = (await req.json()) as { agentId?: string; responseId?: string }
  const { agentId, responseId } = body

  if (!agentId || !responseId) return badRequest("agentId and responseId are required")

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  })

  if (!agent) return notFound()

  const platformUrl = `${PLATFORM_API_URL}/agent/${agent.workflowId}/responses/${responseId}/cancel`

  const response = await fetch(platformUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    return Response.json({ cancelled: false, error: text }, { status: response.status })
  }

  const data = await response.json()
  return Response.json(data)
}
