/**
 * POST /api/demo/suggestions
 *
 * Generates three short, click-to-send prompts for the composer chip row, based
 * on the user's connected MCP sources and a compact memo of the current
 * conversation. Backed by Claude Haiku for sub-second latency; system + MCP
 * description blocks are prompt-cached so steady-state cost is minimal.
 *
 * This route returns 4xx/5xx on any failure — there is no fallback / canned
 * suggestion path. The client treats non-200 as "show nothing" and never
 * masks a real failure behind a hard-coded prompt.
 */
import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import {
  buildMcpDescriptionBlock,
  buildSystemPrompt,
  buildUserPrompt,
  parseHaikuOutput,
} from "@/lib/suggestions/prompt"
import type {
  SuggestionsErrorBody,
  SuggestionsErrorCode,
  SuggestionsRequest,
  SuggestionsResponse,
} from "@/lib/suggestions/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HAIKU_MODEL = "claude-haiku-4-5-20251001"
const HAIKU_TIMEOUT_MS = 8000

export async function POST(req: Request): Promise<Response> {
  let body: SuggestionsRequest
  try {
    body = (await req.json()) as SuggestionsRequest
  } catch {
    return errorResponse("invalid-body", "request body is not valid JSON", 400)
  }

  const validation = validateBody(body)
  if (validation) return validation

  // Empty MCP config is a real product state, not a Haiku failure — short-circuit
  // before paying for a model call that would have nothing meaningful to say.
  const { mcpSnapshot, memo, mode, lengthHint } = body
  if (mcpSnapshot.clusters.length === 0 && mcpSnapshot.externalApis.length === 0) {
    return errorResponse(
      "empty-config",
      "no clusters or external APIs are connected — nothing to suggest",
      422,
    )
  }

  // ANTHROPIC_API_KEY is validated at module load via the env proxy. Surface a
  // clean 503 instead of leaking an internal stack trace when the key is the
  // build-time placeholder.
  let apiKey: string
  try {
    apiKey = env.ANTHROPIC_API_KEY
  } catch (err) {
    return errorResponse(
      "platform-env-missing",
      err instanceof Error ? err.message : String(err),
      503,
    )
  }

  const maxChars = clampLengthHint(lengthHint)
  const systemBlock = buildSystemPrompt(mode, maxChars)
  const mcpBlock = buildMcpDescriptionBlock(mcpSnapshot)
  // Per-request nonce so repeated calls with identical memo + config don't
  // collapse to the same three suggestions. Lives in the (uncached) user
  // message; the system + MCP blocks stay cacheable. Anthropic Messages API
  // has no `seed` parameter, so this is the cleanest way to perturb output
  // without bumping temperature past its default of 1.0.
  const nonce = crypto.randomUUID().slice(0, 8)
  const userPrompt = buildUserPrompt(memo, nonce)

  const client = new Anthropic({ apiKey })
  let raw: string
  try {
    const message = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: 300,
        // Two-block system array so the cluster/connector description gets its
        // own cache breakpoint — saved configurations change far less often
        // than the user list, so this block hits the cache across sessions.
        system: [
          { type: "text", text: systemBlock, cache_control: { type: "ephemeral" } },
          { type: "text", text: mcpBlock, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: AbortSignal.timeout(HAIKU_TIMEOUT_MS) },
    )
    raw = textFromMessage(message)
  } catch (err) {
    return errorResponse("haiku-failed", err instanceof Error ? err.message : String(err), 502)
  }

  let parsed: [string, string, string]
  try {
    parsed = parseHaikuOutput(raw, maxChars)
  } catch (err) {
    return errorResponse("malformed-output", err instanceof Error ? err.message : String(err), 502)
  }

  const response: SuggestionsResponse = { suggestions: parsed }
  return NextResponse.json(response)
}

// ─── helpers ────────────────────────────────────────────────────────────────

function validateBody(body: SuggestionsRequest): Response | null {
  if (!body || typeof body !== "object") {
    return errorResponse("invalid-body", "body is not an object", 400)
  }
  if (body.mode !== "dataflow" && body.mode !== "agentic") {
    return errorResponse("invalid-body", "mode must be 'dataflow' or 'agentic'", 400)
  }
  if (!body.mcpSnapshot || typeof body.mcpSnapshot !== "object") {
    return errorResponse("invalid-body", "mcpSnapshot is missing", 400)
  }
  if (!Array.isArray(body.mcpSnapshot.clusters)) {
    return errorResponse("invalid-body", "mcpSnapshot.clusters must be an array", 400)
  }
  if (!Array.isArray(body.mcpSnapshot.externalApis)) {
    return errorResponse("invalid-body", "mcpSnapshot.externalApis must be an array", 400)
  }
  if (body.memo !== null && typeof body.memo !== "string") {
    return errorResponse("invalid-body", "memo must be a string or null", 400)
  }
  return null
}

/** Mobile composer cap is tighter than desktop — caller passes a hint. */
function clampLengthHint(hint: number | undefined): number {
  if (typeof hint !== "number" || !Number.isFinite(hint)) return 90
  return Math.max(40, Math.min(120, Math.round(hint)))
}

function textFromMessage(message: Anthropic.Messages.Message): string {
  const out: string[] = []
  for (const block of message.content) {
    if (block.type === "text") out.push(block.text)
  }
  const text = out.join("\n").trim()
  if (!text) throw new Error("Haiku returned no text content")
  return text
}

function errorResponse(error: SuggestionsErrorCode, message: string, status: number): Response {
  const body: SuggestionsErrorBody = { error, message }
  return NextResponse.json(body, { status })
}
