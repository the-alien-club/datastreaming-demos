import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { adminFetch } from "@/lib/platform/admin-fetch"

export const dynamic = "force-dynamic"

export async function GET() {
  const res = await adminFetch(`/mcp-configurations/${env.DEMO_CONFIG_SLUG}`)
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to load configuration (${res.status})` },
      { status: res.status },
    )
  }
  const body = await res.json()
  return NextResponse.json(body)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const res = await adminFetch(`/mcp-configurations/${env.DEMO_CONFIG_SLUG}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to save configuration (${res.status})` },
      { status: res.status },
    )
  }
  return NextResponse.json(await res.json())
}
