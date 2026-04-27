// Standard JSON response helpers for the chatbot's internal `/api/*`
// routes.
//
// `ok(data, status?)` returns the resource (or list) directly — the demo
// frontend already consumes bare bodies and switching to a wrapping
// `{ data }` envelope mid-flight would mean coordinated FE/BE changes
// that aren't worth the refactor cost for this demo.
//
// `err(message, status, issues?)` always returns `{ error: { message } }`
// (plus optional structured `issues` for validators). That replaces a mix
// of `new Response("Unauthorized", { status })`, `Response.json({ error })`,
// and `NextResponse.json({ error })` — the frontend now has one shape to
// parse on failure.
//
// Streaming routes (`/api/chat`) are exempt — they emit AI-SDK UI message
// parts and use bare `Response`/`new Response()` directly.

// Wire-format kept simple for backward compat with the frontend's
// existing `err.error` reads:
//
//   { error: <human-readable message>, issues?: <structured payload> }
//
// Validation failures attach a structured `issues` blob that consumers
// can opt into; the `error` string is always present.
export interface ApiErrorBody {
  error: string
  /** Optional structured payload — e.g. zod validation issues. */
  issues?: unknown
}

export function ok<T>(data: T, init?: number | ResponseInit): Response {
  const responseInit: ResponseInit | undefined =
    typeof init === "number" ? { status: init } : init
  return Response.json(data, responseInit)
}

export function err(
  message: string,
  status: number,
  issues?: unknown,
): Response {
  const body: ApiErrorBody = issues === undefined ? { error: message } : { error: message, issues }
  return Response.json(body, { status })
}

export const unauthorized = (message = "Unauthorized") => err(message, 401)
export const notFound = (message = "Not found") => err(message, 404)
export const badRequest = (message = "Bad request", issues?: unknown) =>
  err(message, 400, issues)
export const unprocessable = (message: string, issues?: unknown) =>
  err(message, 422, issues)
export const conflict = (message: string) => err(message, 409)
