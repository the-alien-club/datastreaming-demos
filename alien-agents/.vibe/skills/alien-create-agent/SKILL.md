---
name: alien-create-agent
description: Design and create a new Alien Agent end-to-end. Use when the user invokes /create-agent, asks to build/design/scaffold a new Alien Agent, or asks for help configuring an agent's prompts, specialists, MCPs, or corpora. Follows an 8-step workflow: resolve auth, build catalog, present catalog, open design discussion, gap analysis, compose draft, user confirmation, then API provisioning. All writes require explicit user confirmation. Matches review-agent rubric quality standards.
license: MIT
metadata:
  author: Alien Agents Team
  version: "1.0.0"
  source: Converted from .claude/skills/create-agent
---

# Alien Create Agent

You are designing a brand-new Alien Agent with the user, then provisioning it via the API. This skill has two phases: **discovery + design** (read-only) and **provision** (writes — gated by explicit confirmation).

The construction quality bar is the same the alien-review-agent skill uses to flag problems. Build to *avoid* every red and yellow in that rubric.

---

## Prerequisites

- Running from the alien-agents repository root (where scripts/get-session.mjs exists)
- Node.js installed (for the auth helper script)
- Playwright installed for browser-based auth: npm install && npx playwright install chromium
- Base URL: defaults to https://demo.legaldataspace.eu, override with ALIEN_AGENTS_BASE_URL env var

---

## Step 1 - Resolve Authentication

The Alien Agents API requires a better-auth session cookie.

**Flow:**
1. Check if ALIEN_AGENTS_COOKIE env var is already set in this session
2. If not, run: node scripts/get-session.mjs --base-url "${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}"
3. Branch on exit code:
   - Exit 0: stdout is <name>=<value>. Capture into memory variable $COOKIE
   - Exit 127: Playwright not installed. Use ask_user_question:
     * Option 1: Install Playwright now (show commands: npm install && npx playwright install chromium)
     * Option 2: Paste cookie manually (guide user through browser devtools)
   - Exit 1 or 2: Auth failed. Surface stderr, offer same two options
4. Never log, write, or echo the cookie value. Pass only via -H "Cookie: $COOKIE" in curl commands
5. Set BASE variable: ${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}

**Manual cookie paste instructions:**
1. Open https://demo.legaldataspace.eu in your browser
2. Sign in with your account
3. Open Developer Tools (F12) -> Application -> Cookies
4. Find cookie named better-auth.session_token
5. Copy in format: better-auth.session_token=YOUR_VALUE_HERE
6. Paste it here when prompted

---

## Step 2 - Build the Catalog

Fetch available resources using the captured cookie:

```bash
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/agents" > /tmp/cat-agents.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/specialists" > /tmp/cat-specs.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/datasets" > /tmp/cat-datasets.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/mcps" > /tmp/cat-mcps.json
```

If any GET fails (401, 403, 404, 5xx), surface the error and stop.

Build in-memory catalog:
- agents: AgentListResponse (filter isOwn for full data, include public for inspiration)
- specialists: SpecialistListResponse (reusable subagent templates)
- datasets: DatasetListItem[] with status
- mcps: McpListResponse (plus built-in datacluster id)

---

## Step 3 - Present the Catalog

Render concise markdown tables. Truncate all descriptions to <= 80 chars.

# Available to you on ${BASE}

**MCPs** (N total):
| id | name | provider | description |
|---|---|---|---|
| datacluster | Data Cluster | (built-in) | Corpus search for attached datasets |
| <id> | <name> | <provider> | <description> |

**Datasets** (M total, K ready):
| name | status | entries | aiInstructions? |
|---|---|---|---|
| <name> | <status> | <count or -> | <yes/no> |

**Specialists** (P total):
| name | model | mcps | description |
|---|---|---|---|
| <name> | <model> | <mcp-ids> | <description> |

**Your existing agents** (Q total):
| name | subagents | model |
|---|---|---|
| <name> | <count> | <model> |

End with: "What would you like to build? Describe the agent's purpose in your own words — the domain, who uses it, the kinds of tasks it should handle. I'll ask follow-ups as needed."

Stop and wait for user response.

---

## Step 4 - Open Discussion Loop

Gather requirements. Topics in priority order (only ask about what user hasn't volunteered):

- Domain / role - what subject matter?
- Audience - who uses it?
- Core tasks - 2-5 concrete things it should do
- Tools needed - web search, corpus lookup, code execution, translation?
- Output format - long-form, JSON, citations?
- Constraints / refusals - what should it NOT do?

Ask 1-2 questions per turn. Don't checklist-quiz the user.

When you have enough (typically 2-4 turns), say: "I have enough to draft an agent. Before I do, here's what I'm planning to match against the catalog — confirm or correct any of it."

Summarize in 4-6 bullets. Stop and wait.

---

## Step 5 - Gap Analysis

Compare user needs to catalog. Classify each capability:

- 🟢 Covered by catalog - reuse existing MCP/dataset/specialist
- 🟡 Partial match - close but needs aiInstructions update or wrapper
- 🔴 Gap - no existing resource

Render as:

## Capability mapping

🟢 Web search -> use MCP "<name>"
🟢 Legal corpus -> use dataset "<name>" (status: ready, N entries)
🔴 Translation -> no MCP provides this

For each 🔴 gap, use ask_user_question (header: "Gap"):
- Provision via API - create MCP entry now (need server URL + transport) OR create empty dataset (user uploads via UI)
- Skip - proceed without, note gap in description
- Stop - let me set this up first (exit skill)

If user chooses Stop on any gap, exit gracefully.

---

## Step 6 - Compose the Draft

Build draft object:
```
draft = {
  agent: CreateAgentData,
  mcpsToCreate: CreateMcpBody[],
  datasetsToCreate: CreateDatasetData[],
  datasetsToAttach: [{ id: string }]
}
```

Apply review-agent RUBRIC checks:

**Core fields:**
- name: Verb-noun, domain-specific, <= 60 chars (RUBRIC 1.1)
- description: One sentence from systemPrompt first lines, <= 200 chars (RUBRIC 1.2)
- starterPrompts: 3-5 prompts, first-message text, 1-500 chars each (RUBRIC 1.3)

**System prompt:**
- Starts with "You are <role>." (RUBRIC 1.6)
- Includes scope, audience, capabilities, output format, constraints (RUBRIC 1.4-1.6)
- 500-1500 chars target
- No placeholders (RUBRIC 1.5)

**Steps:**
- Only if meaningful procedural breakdown
- Each: verb-object name, >= 80 chars prompt (RUBRIC 2.5, 2.6)

**Model:**
- Default: gpt-4.1-mini
- Upgrade if prompt mentions: long document, complex reasoning, multi-step planning, deep research, code generation, math (RUBRIC 1.7)

**Subagents:**
- For 🟢/🟡 specialist reuse: copy name, description, systemPrompt, model, mcpIds
- For gaps: inline subagent with dispatchable name
- Name: dispatchable noun phrase (RUBRIC 3.1)
- Description: "Use this specialist when X. It can Y." (RUBRIC 3.2)
- systemPrompt: role + scope + tool usage + output format, >= 300 chars (RUBRIC 3.3)
- mcpIds: non-empty if prompt promises tool use (RUBRIC 3.4)
- DO NOT include corpus subagents - auto-generated by /attach

---

## Step 7 - Present and Confirm

Render full proposed plan:

# Proposed agent

**Name**: <draft.agent.name>
**Description**: <draft.agent.description>
**Model**: <draft.agent.model>

## System prompt (<N> chars)
```
<full text>
```

## Steps (<n>)
1. **<name>** - <first 200 chars>
...

## Starter prompts (<n>)
- <prompt 1>
- ...

## Specialists (<n>)
### <slug> - <name>
**When to dispatch**: <description>
**MCPs**: <comma list or (none)>
**Prompt** (<N> chars): <first 300 chars>...

## Provisioning order
1. Create N new MCP(s): <names>
2. Create M new (empty) dataset(s): <names> (upload via UI)
3. Create the agent
4. Attach K existing dataset(s): <names>

Use ask_user_question (header: "Apply"):
- Apply now - proceed to Step 8
- Modify first - user describes changes, update draft, re-render
- Cancel - discard draft, exit

---

## Step 8 - Provision via API

Execute SEQUENTIALLY. Stop on first failure.

**8a. Create new MCPs:**
```bash
curl -s -S --fail-with-body -X POST "${BASE}/api/mcps" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<JSON body>'
```
Capture returned id, rewrite draft.agent.subagents[].mcpIds placeholders.

**8b. Create new empty datasets:**
```bash
curl -s -S --fail-with-body -X POST "${BASE}/api/datasets" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<JSON body>'
```
Capture returned id. Surface UI URL: ${BASE}/datasets/<id>

Ask user: "Upload files for these datasets in the UI. Done - proceed with attach OR Skip - I'll attach later"

**8c. Create the agent:**
```bash
curl -s -S --fail-with-body -X POST "${BASE}/api/agents" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<JSON body>'
```
Capture returned agent id.

**8d. Attach datasets:**
```bash
curl -s -S --fail-with-body -X POST "${BASE}/api/datasets/<id>/attach" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '{"agentId":"<agent-id>"}'
```

**8e. Surface result:**
```
Agent created.

Name: <name>
URL:  ${BASE}/agents/<id>
Edit: ${BASE}/agents/<id>

Provisioned:
- N new MCP(s)
- M new dataset row(s) - upload files via UI
- K dataset(s) attached
- L specialist subagent(s) inlined

Next:
- Open agent and run a starter prompt to sanity-check dispatch
- Use /review-agent <id> to audit
```

---

## Error Handling

| Status | Action |
|---|---|
| 401 | Cookie expired - drop it, return to Step 1 |
| 400 | Zod validation failed - surface body, offer Fix and retry or Abort |
| 409 | POST /agents - workflow exists (shouldn't happen) - surface and stop |
| 5xx | Surface status + body, stop |

Partial failure: Report exactly what succeeded and what failed with manual retry commands.

---

## Guardrails

- Read-only by default: Steps 1-7 are GET only
- Step 8 only after explicit confirmation
- No PUT, DELETE, PATCH - never modifies existing resources
- No file uploads - creates empty dataset rows, user uploads via UI
- No specialist creation - reads specialists to inline config, never POSTs to /api/specialists
- Cookie hygiene: Never log, persist, or echo cookie values
- Truncate: Catalog <= 80 chars, prompts <= 300 chars in report
- No invented fields: All POST bodies must match Zod schemas

---

## API Reference

**Endpoints:** GET /api/agents, /api/specialists, /api/datasets, /api/mcps, POST /api/mcps, POST /api/datasets, POST /api/agents, POST /api/datasets/:id/attach

**POST /api/mcps body:**
```typescript
{
  name: string;                    // 1-120 chars
  serverUrl: string;              // http(s) URL required
  transport?: "streamable_http" | "sse" | "stdio"; // only "streamable_http" is supported by the platform's MCP node; sse/stdio fail at runtime
  authToken?: string | null;
  description?: string | null;    // max 2000
  categories?: string[];          // each 1-80 chars, max 20
  type?: string | null;          // max 40
  provider?: string | null;      // max 80
  pricePerQuery?: string | null;
  enabled?: boolean;
}
```

**POST /api/datasets body:**
```typescript
{
  name: string;                   // 1-120 chars
  description?: string;           // max 2000
  aiInstructions?: string;       // max 8000
}
```

**POST /api/agents body:**
```typescript
{
  name: string;                   // 1-120 chars, REQUIRED
  description?: string;           // max 2000
  systemPrompt: string;           // 1-128000 chars, REQUIRED
  author?: string | null;         // max 120
  model?: string;                 // 1-120, default "gpt-4.1-mini"
  steps?: [{ name: string; prompt: string; }];  // each name 1-120, prompt 1-16000
  starterPrompts?: string[];      // each 1-500 chars
  subagents?: [{
    name: string;                 // 1-120, REQUIRED
    description?: string;         // max 2000
    systemPrompt: string;         // 1-128000, REQUIRED
    model: string;                // 1-120, REQUIRED on subagents
    mcpIds: string[];             // default []
    datasetId?: string | null;
  }];
}
```

**Critical:** subagents[].model is REQUIRED. Do NOT include corpus subagents in initial POST - they're auto-generated by /api/datasets/:id/attach with mcpIds: ["datacluster"]

**POST /api/datasets/:id/attach body:**
```typescript
{ agentId: string; }
```
