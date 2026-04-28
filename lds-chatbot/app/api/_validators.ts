// Shared zod schemas for every internal `/api/*` route body. Routes call
// `parseBody(req, schema)` once, then read fully-typed values with no
// `as Foo` casts. Validation failures return 400 with a structured
// `issues` array that mirrors zod's own flatten output so the frontend
// can map them to fields without re-parsing.
//
// Per `CLAUDE_ERROR_PATTERNS.md §1`: never call `req.json()` and key
// into the result without going through here.

import { z } from "zod"
import { badRequest } from "@/lib/api-response"

const ID = z.string().trim().min(1, "must be non-empty")
const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")
const LONG_TEXT = z.string().max(64_000, "max 64000 chars")
const STARTER_PROMPT = z.string().trim().min(1).max(500)

// Pre-built MCP transport union — the platform accepts a fixed set.
const TRANSPORT = z.enum(["streamable_http", "sse", "stdio"])

// HTTP/HTTPS only — `javascript:`/`data:` URIs were accepted before.
const HTTP_URL = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => {
      try {
        const u = new URL(v)
        return u.protocol === "http:" || u.protocol === "https:"
      } catch {
        return false
      }
    },
    { message: "must be a valid http(s) URL" },
  )

// ── Steps & subagents ──────────────────────────────────────────────────────

export const stepSchema = z.object({
  name: NAME,
  prompt: z.string().trim().min(1, "prompt is required").max(16_000),
})

export const subagentConfigSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(LONG_TEXT.maxLength ?? 64_000),
  model: z.string().trim().min(1).max(120),
  mcpIds: z.array(ID).default([]),
  // `datasetId` is preserved end-to-end so corpus attachments survive a
  // round-trip save (see C-3 in REVIEW_SUMMARY).
  datasetId: ID.nullable().optional(),
})

// ── Agents ─────────────────────────────────────────────────────────────────

export const createAgentBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  systemPrompt: LONG_TEXT.optional().default(""),
  steps: z.array(stepSchema).default([]),
  model: z.string().trim().min(1).max(120).optional(),
  subagents: z.array(subagentConfigSchema).default([]),
  starterPrompts: z.array(STARTER_PROMPT).optional(),
})

// PUT is full-replace: the request body must carry the complete agent
// shape. Required fields stay required; optional metadata stays optional.
//
// Why no defensive coercion (no `string | array` unions, no fallback to
// existing DB state for missing arrays):
//   - A client that ships `steps: "[]"` (string) has a bug; silently
//     coercing to `[]` masks it. Reject with 400 so the bug surfaces.
//   - A client that omits `subagents` from a PUT and previously had a
//     populated subagent list will, under "PUT means full-replace",
//     wipe them. Requiring the field forces the client to be explicit
//     ("yes, I want zero subagents" → `subagents: []`; "I want to keep
//     them" → echo them back).
//
// See lds-chatbot/internal-docs/QA_VERIFY_2026-04-26.md "Two real
// findings" for the live-test traces that motivated this contract.
//
// `description` and `starterPrompts` remain optional because the
// existing edit form does not always include them in the payload.
export const updateAgentBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.nullable().optional(),
  systemPrompt: LONG_TEXT,
  steps: z.array(stepSchema),
  starterPrompts: z.array(STARTER_PROMPT).optional(),
  model: z.string().trim().min(1).max(120),
  subagents: z.array(subagentConfigSchema),
})

export const subagentCreateBodySchema = subagentConfigSchema
export const subagentDeleteBodySchema = z.object({
  subagentId: ID,
})

// ── MCPs ───────────────────────────────────────────────────────────────────

export const createMcpBodySchema = z.object({
  name: NAME,
  serverUrl: HTTP_URL,
  transport: TRANSPORT.default("streamable_http"),
  authToken: z.string().nullable().optional(),
  description: SHORT_TEXT.nullable().optional(),
  category: z.string().trim().max(50).nullable().optional(),
  enabled: z.boolean().optional(),
})

export const updateMcpBodySchema = z.object({
  name: NAME.optional(),
  serverUrl: HTTP_URL.optional(),
  transport: TRANSPORT.optional(),
  authToken: z.string().nullable().optional(),
  description: SHORT_TEXT.nullable().optional(),
  category: z.string().trim().max(50).nullable().optional(),
  enabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})

// ── Visibility patch ───────────────────────────────────────────────────────

// Narrow schema for the PATCH /api/{mcps,specialists}/[id]/visibility endpoint.
// Kept separate from the full PUT bodies so callers can toggle isPublic without
// supplying the entire resource shape.
export const patchVisibilityBodySchema = z.object({
  isPublic: z.boolean(),
})

// ── Specialists ────────────────────────────────────────────────────────────

export const specialistBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.nullable().optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(64_000),
  model: z.string().trim().min(1).max(120).optional(),
  mcpIds: z.array(ID).optional(),
})

// ── Datasets ───────────────────────────────────────────────────────────────

export const createDatasetBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
})

export const datasetAttachBodySchema = z.object({
  agentId: ID,
})

// ── Helper ─────────────────────────────────────────────────────────────────

/**
 * Read and validate a JSON request body. Returns the parsed value on
 * success or a `Response` with the right HTTP status on failure — caller
 * forwards it directly:
 *
 *   const parsed = await parseBody(request, mySchema)
 *   if (parsed instanceof Response) return parsed
 *   const body = parsed
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    // 400 (not 422) for shape errors: the body is malformed at the
    // schema level. We use the same status across every internal route
    // for consistency — the frontend reads `error` + optional `issues`
    // regardless of whether the failure is missing-field or wrong-type.
    return badRequest("Validation failed", result.error.flatten())
  }
  return result.data
}
