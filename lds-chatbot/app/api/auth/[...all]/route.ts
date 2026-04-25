import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth"

// Opt out of Next.js 16's fetch caching wrapper — it interferes with
// better-auth's internal fetch chain and produces ECONNREFUSED.
export const dynamic = "force-dynamic"

export const { GET, POST } = toNextJsHandler(auth)
