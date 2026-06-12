#!/usr/bin/env node
// Creates the Mode A (Agentic flow) workflow for the publisher demo on the
// Alien platform. Run once per environment, then put the returned id in
// `.env` as `DEMO_WORKFLOW_ID`.
//
// Usage:
//   PLATFORM_API_URL=https://api.alpha.alien.club \
//   BACKEND_API_KEY=oat_xxx \
//   ORG_ID=3 \
//   MCP_ALIEN_URL=https://mcp.alpha.alien.club \
//   DEMO_CONFIG_SLUG=cfg_publisher_demo \
//   MODEL_SLUG=claude-sonnet-4-6 \
//   node scripts/create-workflow.mjs
//
// Re-run with WORKFLOW_ID=<existing-id> to PATCH instead of POST.
//
// Mirrors the graph shape produced by
// `datastreaming-demos/alien-agents/lib/platform/workflows.ts` so the workflow
// is editable in the platform UI later. Prompts live inline below — edit them
// here, re-run, save the new id.

const PLATFORM_API_URL = (process.env.PLATFORM_API_URL ?? "https://api.alpha.alien.club").replace(/\/$/, "")
const TOKEN = process.env.BACKEND_API_KEY ?? process.env.PLATFORM_TOKEN
const ORG_ID = process.env.ORG_ID ?? "3"
const MCP_ALIEN_URL = (process.env.MCP_ALIEN_URL ?? "https://mcp.alpha.alien.club").replace(/\/$/, "")
const DEMO_CONFIG_SLUG = process.env.DEMO_CONFIG_SLUG ?? "cfg_publisher_demo"
const MODEL_SLUG = process.env.MODEL_SLUG ?? "claude-sonnet-4-6"
const EXISTING_WORKFLOW_ID = process.env.WORKFLOW_ID

if (!TOKEN) {
  console.error("Missing BACKEND_API_KEY env var.")
  process.exit(1)
}

const MCP_SERVER_URL = `${MCP_ALIEN_URL}/mcp?config=${DEMO_CONFIG_SLUG}`

// ─── Prompts (v2) ────────────────────────────────────────────────────────────

const ORCHESTRATOR_PROMPT = `You are the orchestrator for a publisher's research demo on the Alien platform. You have no retrieval, search, or synthesis tools — you only dispatch subagents and assemble their output. The rail UI shows the orchestration; do not narrate it.

Pipeline (run once per user turn):

1. PLAN. Call the \`planner\` subagent with the user's raw query. It returns a JSON array of 1–4 objects: \`[{ "q": "...", "tool": "..." }, ...]\`. Treat its output as opaque — do not edit, re-order, or "improve" the questions.

2. RESEARCH. Dispatch the \`researcher\` subagent once per planner question, passing \`{ "q": "...", "tool": "..." }\` verbatim as the prompt. Issue every researcher call in the SAME tool batch — never wait for one before dispatching the next. Sequential dispatch defeats the demo.

3. CRITIQUE. Concatenate the researchers' outputs in planner order and pass the merged text plus the original user query to the \`critic\` subagent. It returns \`{ "verdict": "approved" }\` or \`{ "verdict": "revise", "issues": ["...", "..."] }\`.

4. ANSWER. Write a single concise synthesis (≤6 short paragraphs or a tight bullet list, whichever fits) that:
   - Answers the user's original query directly.
   - Preserves every citation the researchers attached (\`[id:...]\` or \`[doi:...]\`); do not invent or drop them.
   - Is written in the same language as the user's query.
   If the critic returned \`revise\`, prepend exactly one italic line: \`_Critic flagged: <comma-joined issues>_\` and then the synthesis. Do not re-dispatch any subagent — one round only.

Hard rules:
- Your first visible token is the synthesis (or the critic-flagged line). No preamble, no meta-commentary, no "Sure, here's…".
- If the planner returns \`[]\` or invalid JSON, answer the user from your own knowledge prepended with: \`_planner returned no plan — answering without retrieval_\`.
- Never call subagents recursively or in a second round.`

const PLANNER_PROMPT = `You expand a user query into research questions for a publisher's MCP-backed agent. The \`mcp__alien__*\` tools are attached so you can SEE the catalog of available tools. You MUST NOT call any of them. Planning only.

Method:

1. Read the attached tool catalog. Note the exact tool names available (e.g. \`datacluster_keyword_search\`, \`datacluster_vector_search\`, \`datacluster_get_entry_content\`, \`crossref_search_works\`, \`semantic_scholar_search\`, \`orcid_*\`). Use only names that actually appear in your catalog.

2. Decide how many questions to return:
   - DEFAULT: 1 question. Most user queries are already focused enough.
   - 2–3 questions: only if the query has clearly distinct sub-parts (e.g. "compare X and Y", "find papers AND check author affiliations").
   - 4 questions: only for genuinely broad survey requests.
   - Each question must be SELF-CONTAINED (answerable without the others) and NON-OVERLAPPING (no near-duplicates). If you cannot justify a question's distinctness in one sentence, drop it.

3. For each question, pick exactly ONE tool from the catalog as the first call. Use the exact tool name as it appears in the catalog — no paraphrasing, no \`mcp__alien__\` prefix.

Output strict JSON, no prose, no code fences:

[{ "q": "<one specific research question>", "tool": "<exact_tool_name>" }, ...]

If the user query is conversational (greeting, thanks, "what can you do"), return \`[]\` and nothing else.`

const RESEARCHER_PROMPT = `You answer ONE research question using the publisher's MCP tools. You have full \`mcp__alien__*\` access.

Input: \`{ "q": "...", "tool": "..." }\` from the orchestrator.

Procedure:

1. First call: invoke the suggested \`tool\` with arguments tailored to \`q\`. If the tool name does not exist in your attached catalog, pick the closest keyword or vector search tool that does — never invent tool names.

2. Triage the results. If you see ≥1 clearly relevant hit, fetch full content for the TOP 1–2 hits only (\`datacluster_get_entry_content\` for cluster entries, the appropriate detail endpoint for proxied connectors).

3. If first-call results are weak (0 relevant hits): escalate ONCE — switch keyword→vector (or vice versa), or broaden the query terms. Do not run more than one escalation.

HARD BUDGET: 4 tool calls total. After your 4th tool call you MUST stop and return what you have. Going over budget is a worse failure than partial results.

Output format (plain text, no JSON, in the language of \`q\`):

<2–6 sentence answer to q>

Sources:
- [id:<entry_id_or_doi>] — <one-line note: what tool call surfaced this and what claim it supports>
- [id:...] — ...

Every claim in your answer must be traceable to one of the listed sources via its \`[id:...]\` tag. If no claim can be supported after your budget is spent, return:

_low confidence_: <one-line description of what was attempted>

Sources:
- (none)

Never fabricate ids, DOIs, titles, or author names. Better to return "_low confidence_" than to guess.`

const CRITIC_PROMPT = `You audit a merged synthesis from 1–4 researchers against the original user query. You have full \`mcp__alien__*\` access — USE IT ONLY TO VERIFY existing claims, never to extend or rewrite.

Input: the original user query + the concatenated researcher outputs (each with its own "Sources" block).

Method:

1. Skim every claim in the researcher outputs. Identify up to 2 LOAD-BEARING claims — claims that drive the answer to the user's query, not background or framing. If fewer than 2 such claims exist, audit what is present.

2. For each load-bearing claim, run ONE verification call (\`datacluster_get_entry_content\` for \`[id:entry_*]\` tags, \`crossref_search_works\` for \`[doi:...]\` tags, or the matching connector). Confirm the cited source actually says what the researcher claims.

3. Cross-check the researchers against each other. If two researchers state contradictory facts (different dates, opposing conclusions, mismatched author names), flag it as an issue.

HARD BUDGET: 2 verification calls total. After your 2nd call you MUST emit a verdict, even if both calls returned errors.

Output strict JSON, no prose, no code fences:

  { "verdict": "approved" }

or

  { "verdict": "revise", "issues": ["<short specific issue>", "..."] }

Verdict rules:
- \`approved\` if every load-bearing claim is either verified or uncontentious (definitions, common knowledge), AND no inter-researcher contradiction.
- \`revise\` if a load-bearing claim is unsupported, contradicted by your verification call, or contradicted by another researcher.
- If both verification calls fail (tool errors, timeouts), emit \`{ "verdict": "revise", "issues": ["could not verify load-bearing claims"] }\` — do NOT spend more calls. This signals "ship with caveat" to the orchestrator.

Never extend the answer, suggest follow-up questions, or rewrite content. Audit only.`

// Subagent `description` is what the orchestrator sees in its `task()` tool
// catalog. Keep these crisp — they drive dispatch reliability.
const PLANNER_DESCRIPTION = "Expand a user query into 1–4 self-contained research questions, each tagged with the exact MCP tool to use first. Returns strict JSON: [{q, tool}, ...]. Planning only, never retrieves."
const RESEARCHER_DESCRIPTION = "Answer ONE research question by calling MCP retrieval tools (≤4 calls). Takes {q, tool} as input. Returns a 2–6 sentence answer with [id:...] citations and a Sources block."
const CRITIC_DESCRIPTION = "Audit a merged synthesis against the original user query using ≤2 verification calls. Returns strict JSON: {verdict:'approved'} or {verdict:'revise', issues:[...]}."

// ─── Graph builder (mirrors lib/platform/workflows.ts) ───────────────────────

const param = (value, isExpression = false) => ({ value, isExpression, isAttachedToInputNode: false })
const exprParam = (value, isAttachedToInputNode = false) => ({ value, isExpression: true, isAttachedToInputNode })

function buildSubagentNode(id, sub, yOffset) {
  return {
    id,
    type: "subagent",
    data: {
      label: "Subagent",
      handles: ["agent", "tools"],
      isInput: false, isOutput: false, isTool: false,
      errors: [], inputs: [], outputs: [],
      params: {
        model: param(sub.model),
        system_prompt: param(sub.systemPrompt),
        description: param(sub.description),
      },
    },
    position: { x: 400, y: yOffset },
  }
}

function buildMcpNode(id, serverUrl, x, y) {
  return {
    id,
    type: "mcp_server",
    data: {
      label: "MCP Server",
      handles: ["tool"],
      isInput: false, isOutput: false, isTool: false,
      errors: [], inputs: [], outputs: [],
      params: {
        server_url: param(serverUrl),
        transport: param("streamable_http"),
        auth_token: param(null),
        tool_filter: param(null),
      },
    },
    position: { x, y },
  }
}

function buildGraph({ model, systemPrompt, subagents }) {
  const innerNodes = [
    {
      id: "agentInput-3", type: "agent_input",
      data: {
        label: "Agent Input", handles: ["outputs"],
        isInput: true, isOutput: false, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {
          user_prompt: exprParam("@httpRequest-0.user_prompt"),
          session_id: exprParam("@httpRequest-0.session_id"),
        },
        schema: {
          input: {
            type: "object",
            properties: {
              user_prompt: { type: ["string", "null"], default: null },
              session_id: { type: ["string", "null"], default: null },
            },
            additionalProperties: true,
          },
        },
      },
      position: { x: 100, y: 100 },
    },
    {
      id: "deepAgent-4", type: "deep_agent",
      data: {
        label: "Deep Agent",
        handles: ["inputs", "outputs", "tools", "agents"],
        isInput: false, isOutput: false, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {
          model: param(model),
          system_prompt: param(systemPrompt),
          messages: exprParam(""),
          streaming: param(true),
          session_id: exprParam("@agentInput-3.session_id", true),
          user_prompt: exprParam("@agentInput-3.user_prompt", true),
          response_format: param({}),
        },
      },
      position: { x: 400, y: 100 },
    },
    {
      id: "agentOutput-5", type: "agent_output",
      data: {
        label: "Agent Output", handles: ["inputs"],
        isInput: false, isOutput: true, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {
          answer: exprParam("@deepAgent-4"),
          session_id: exprParam("@deepAgent-4.sessionId"),
        },
      },
      position: { x: 700, y: 100 },
    },
  ]

  const innerEdges = [
    { id: "e-input-deep", source: "agentInput-3", target: "deepAgent-4", sourceHandle: "outputs", targetHandle: "inputs" },
    { id: "e-deep-output", source: "deepAgent-4", target: "agentOutput-5", sourceHandle: "outputs", targetHandle: "inputs" },
  ]

  subagents.forEach((sub, idx) => {
    const subId = `subagent-${sub.name}`
    const mcpId = `mcpServer-${sub.name}`
    const y = 300 + idx * 200
    innerNodes.push(buildSubagentNode(subId, sub, y))
    innerNodes.push(buildMcpNode(mcpId, MCP_SERVER_URL, 600, y + 100))
    innerEdges.push({ id: `e-deep-${subId}`, source: "deepAgent-4", target: subId, sourceHandle: "agents", targetHandle: "agent" })
    innerEdges.push({ id: `e-${subId}-${mcpId}`, source: subId, target: mcpId, sourceHandle: "tools", targetHandle: "tool" })
  })

  const outerNodes = [
    {
      id: "httpRequest-0", type: "http_request",
      data: {
        label: "HTTP Request", handles: ["outputs"],
        isInput: true, isOutput: false, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {
          user_prompt: param(""),
          session_id: param(""),
        },
        schema: {
          input: {
            type: "object",
            properties: {
              user_prompt: { type: "string" },
              session_id: { type: ["string", "null"], default: null },
            },
            additionalProperties: true,
          },
        },
      },
      position: { x: 0, y: 100 },
    },
    {
      id: "aiAgent-1", type: "ai_agent",
      data: {
        label: "AI Agent", handles: ["inputs", "outputs"],
        isInput: false, isOutput: false, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {},
        workflow: { nodes: innerNodes, edges: innerEdges },
      },
      position: { x: 300, y: 100 },
    },
    {
      id: "httpResponse-2", type: "http_response",
      data: {
        label: "HTTP Response", handles: ["inputs"],
        isInput: false, isOutput: true, isTool: false,
        errors: [], inputs: [], outputs: [],
        params: {
          data: exprParam("@aiAgent-1"),
          session_id: exprParam("@aiAgent-1.session_id"),
        },
      },
      position: { x: 600, y: 100 },
    },
  ]

  const outerEdges = [
    { id: "e-http-agent", source: "httpRequest-0", target: "aiAgent-1", sourceHandle: "outputs", targetHandle: "inputs" },
    { id: "e-agent-resp", source: "aiAgent-1", target: "httpResponse-2", sourceHandle: "outputs", targetHandle: "inputs" },
  ]

  return { nodes: outerNodes, edges: outerEdges }
}

// ─── Build + POST ────────────────────────────────────────────────────────────

// Note on subagent NAMES: these become the `task()` tool name the orchestrator
// dispatches against. The publisher-demo rail UI labels the second node
// "Specialist", so we name it `specialist` rather than `researcher` to make
// the rail light up without a code change in components/panels/agent.tsx.
const config = {
  model: MODEL_SLUG,
  systemPrompt: ORCHESTRATOR_PROMPT,
  subagents: [
    { name: "planner",    description: PLANNER_DESCRIPTION,    systemPrompt: PLANNER_PROMPT,    model: MODEL_SLUG },
    { name: "specialist", description: RESEARCHER_DESCRIPTION, systemPrompt: RESEARCHER_PROMPT, model: MODEL_SLUG },
    { name: "critic",     description: CRITIC_DESCRIPTION,     systemPrompt: CRITIC_PROMPT,     model: MODEL_SLUG },
  ],
}

const { nodes, edges } = buildGraph(config)

const body = {
  name: "publisher-demo-agentic",
  slug: "publisher-demo-agentic",
  description: "Mode A (Agentic flow) workflow for publisher-demo. Orchestrator + planner/specialist/critic over a single mcp-alien config.",
  isPublic: false,
  type: "agent",
  nodes,
  edges,
}

const method = EXISTING_WORKFLOW_ID ? "PATCH" : "POST"
const path = EXISTING_WORKFLOW_ID ? `/workflows/${EXISTING_WORKFLOW_ID}` : "/workflows"

console.log(`${method} ${PLATFORM_API_URL}${path}`)
console.log(`  org_id:        ${ORG_ID}`)
console.log(`  mcp server:    ${MCP_SERVER_URL}`)
console.log(`  model:         ${MODEL_SLUG}`)
console.log(`  subagents:     ${config.subagents.map(s => s.name).join(", ")}`)
console.log()

const res = await fetch(`${PLATFORM_API_URL}${path}`, {
  method,
  headers: {
    "content-type": "application/json",
    "authorization": `Bearer ${TOKEN}`,
    "x-organization-id": ORG_ID,
    "connection": "close",
  },
  body: JSON.stringify(body),
})

const text = await res.text()
if (!res.ok) {
  console.error(`Platform API error ${res.status} ${res.statusText}`)
  console.error(text)
  process.exit(1)
}

let parsed
try { parsed = JSON.parse(text) } catch { parsed = text }
const data = parsed?.data ?? parsed
const id = data?.id ?? EXISTING_WORKFLOW_ID

console.log(`✓ ${method === "POST" ? "Created" : "Updated"} workflow:`)
console.log(`  id:   ${id}`)
console.log(`  name: ${data?.name ?? "(unchanged)"}`)
console.log(`  slug: ${data?.slug ?? "(unchanged)"}`)
console.log()
console.log(`Put this in datastreaming-demos/publisher-demo/.env:`)
console.log(`  DEMO_WORKFLOW_ID=${id}`)
