import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth"

// Opt out of Next.js 16's fetch caching wrapper — it interferes with
// better-auth's internal fetch chain and produces ECONNREFUSED.
export const dynamic = "force-dynamic"

const nextBasePath = process.env.NEXT_PUBLIC_BASE_PATH || ""

const inner = toNextJsHandler(auth)

// Next.js strips `basePath` from `request.url` inside App Router route
// handlers (the handler sees `/api/auth/...`, not `/agents/api/auth/...`).
// better-auth is configured with `basePath: ${nextBasePath}/api/auth` so
// that the per-request `ctx.baseURL` — and therefore the OAuth redirect_uri
// it emits — carries the /agents prefix the app is mounted under. To make
// the router actually match those paths, we have to put the prefix back on
// the URL before handing the request off.
async function withBasePath(
  req: Request,
  handler: (r: Request) => Promise<Response>,
): Promise<Response> {
  if (!nextBasePath) return handler(req)
  const url = new URL(req.url)
  if (url.pathname.startsWith(`${nextBasePath}/`) || url.pathname === nextBasePath) {
    return handler(req)
  }
  url.pathname = `${nextBasePath}${url.pathname}`
  // Read the body upfront — `new Request(url, { body: req.body })` would
  // need `duplex: "half"` and not all runtimes accept it. arrayBuffer() is
  // safe for the small JSON payloads better-auth uses.
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer()
  const rewritten = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body,
    redirect: req.redirect,
    signal: req.signal,
  })
  return handler(rewritten)
}

export const GET = (req: Request) => withBasePath(req, inner.GET)
export const POST = (req: Request) => withBasePath(req, inner.POST)
