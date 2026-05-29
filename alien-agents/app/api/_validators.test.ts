import { describe, expect, it } from "vitest"
import { parseBody, updateAgentBodySchema } from "./_validators"

// Build a minimal Request stub that satisfies `parseBody`'s contract
// (it only ever calls `.json()`). This keeps the test free of any
// route-handler / Next.js boilerplate.
function jsonRequest(body: unknown): Request {
  return new Request("http://test.local/api/agents/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const FULL_BODY = {
  name: "Literature Researcher",
  description: "Search and summarise scientific literature",
  systemPrompt: "You are a research assistant.",
  steps: [
    { name: "search", prompt: "search the corpus" },
    { name: "summarise", prompt: "summarise findings" },
  ],
  model: "mistral-large-2512",
  subagents: [
    {
      name: "Paper Searcher",
      description: "",
      systemPrompt: "Search the corpus via the search MCP.",
      model: "mistral-large-2512",
      mcpIds: ["search-mcp-id"],
      datasetId: null,
    },
  ],
}

describe("PUT /api/agents/{id} — updateAgentBodySchema", () => {
  // ── Bug 1: stringified `steps` must NOT be silently coerced ────────────
  it("rejects stringified steps with 400 + zod issues (no silent coercion)", async () => {
    const r = await parseBody(
      jsonRequest({ ...FULL_BODY, steps: "[]" }),
      updateAgentBodySchema,
    )
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string; issues?: { fieldErrors?: Record<string, string[]> } }
    expect(body.error).toBe("Validation failed")
    // zod's flatten() puts wrong-type errors under fieldErrors.steps
    expect(body.issues?.fieldErrors?.steps).toBeDefined()
    expect(Array.isArray(body.issues?.fieldErrors?.steps)).toBe(true)
  })

  // ── Bug 2: missing `subagents` must NOT silently wipe DB state ─────────
  it("rejects payload missing subagents with 400 + zod issues", async () => {
    const { subagents: _omitted, ...withoutSubagents } = FULL_BODY
    const r = await parseBody(
      jsonRequest(withoutSubagents),
      updateAgentBodySchema,
    )
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string; issues?: { fieldErrors?: Record<string, string[]> } }
    expect(body.error).toBe("Validation failed")
    expect(body.issues?.fieldErrors?.subagents).toBeDefined()
  })

  it("rejects stringified subagents with 400", async () => {
    const r = await parseBody(
      jsonRequest({ ...FULL_BODY, subagents: "[]" }),
      updateAgentBodySchema,
    )
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
  })

  it("rejects payload missing required `name`", async () => {
    const { name: _omitted, ...rest } = FULL_BODY
    const r = await parseBody(jsonRequest(rest), updateAgentBodySchema)
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
    const body = (await r.json()) as { issues?: { fieldErrors?: Record<string, string[]> } }
    expect(body.issues?.fieldErrors?.name).toBeDefined()
  })

  it("rejects payload missing required `model`", async () => {
    const { model: _omitted, ...rest } = FULL_BODY
    const r = await parseBody(jsonRequest(rest), updateAgentBodySchema)
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
  })

  // ── Happy path: full-shape body parses cleanly ─────────────────────────
  it("accepts a fully-shaped body and returns the parsed value", async () => {
    const parsed = await parseBody(jsonRequest(FULL_BODY), updateAgentBodySchema)
    expect(parsed).not.toBeInstanceOf(Response)
    if (parsed instanceof Response) return
    expect(parsed.name).toBe("Literature Researcher")
    expect(parsed.steps).toHaveLength(2)
    expect(parsed.subagents).toHaveLength(1)
    expect(parsed.subagents[0]?.datasetId).toBeNull()
    expect(parsed.subagents[0]?.mcpIds).toEqual(["search-mcp-id"])
  })

  it("accepts an empty subagents array (explicit zero) without rejecting", async () => {
    const parsed = await parseBody(
      jsonRequest({ ...FULL_BODY, subagents: [] }),
      updateAgentBodySchema,
    )
    expect(parsed).not.toBeInstanceOf(Response)
    if (parsed instanceof Response) return
    expect(parsed.subagents).toEqual([])
  })

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://test.local/api/agents/x", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not json",
    })
    const r = await parseBody(req, updateAgentBodySchema)
    expect(r).toBeInstanceOf(Response)
    if (!(r instanceof Response)) return
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string }
    expect(body.error).toBe("Invalid JSON body")
  })
})
