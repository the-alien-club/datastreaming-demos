---
name: alien-review-agent
description: Holistically review a published Alien Agent — system prompt, ordered steps, specialist subagents (names, descriptions, prompts, MCP wiring), attached corpora, and graph topology. Use when the user invokes /review-agent with an agent ID or URL, asks to audit/review/critique an Alien Agent, or asks how to improve an agent. Renders a structured chat report, then offers an annotated diff OR a full JSON payload of proposed fixes, then optionally PUTs the update back via /api/agents/:id with explicit confirmation.
license: MIT
metadata:
  author: Alien Agents Team
  version: "1.0.0"
  source: Converted from .claude/skills/review-agent
---

# Alien Review Agent

You are reviewing an Alien Agent end-to-end. The user invokes this skill with either a bare agent UUID, an agent URL, or no argument.

The review must cover **four layers**: agent core fields, the assembled system prompt (overall + steps), every specialist subagent, every attached corpus — plus a topology check. Apply the **RUBRIC** checks (embedded below) in order.

You drive the entire flow. Do not delegate review judgements — apply the rubric inline.

---

## Prerequisites

- Running from the alien-agents repository root
- Node.js installed (for auth helper)
- Playwright installed: npm install && npx playwright install chromium
- Base URL: defaults to https://demo.legaldataspace.eu, override with ALIEN_AGENTS_BASE_URL

---

## Step 1 - Parse the Argument

The user may supply:
- A bare UUID: 8f4e1c2a-...
- An agent page URL: .../agents/<uuid> or .../agents/<uuid>/chat[/...]
- **Nothing** → proceed to Step 3 to pick from user's agents

Extract UUID via regex from URL if provided. Do not error on missing argument.

---

## Step 2 - Resolve Authentication

Same flow as alien-create-agent skill.

**Flow:**
1. Check if ALIEN_AGENTS_COOKIE env var is set in this session
2. If set and non-empty, use it directly
3. If empty, run: node scripts/get-session.mjs --base-url "${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}"
4. Branch on exit code:
   - Exit 0: stdout is <name>=<value>. Capture into memory variable $COOKIE (do not write to disk, do not echo)
   - Exit 127: Playwright not installed. Use ask_user_question:
     * Option 1: Install Playwright now (show: npm install && npx playwright install chromium)
     * Option 2: Paste cookie manually (guide: browser devtools → Application → Cookies → better-auth.session_token)
   - Exit 1 or 2: Surface stderr verbatim, offer same two options
5. Never log, write, or echo the cookie. Pass only in curl -H "Cookie: $COOKIE"
6. Set BASE: ${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}

**Manual paste instructions:**
1. Open https://demo.legaldataspace.eu in browser
2. Sign in
3. Open DevTools (F12) → Application → Cookies
4. Find better-auth.session_token
5. Copy: better-auth.session_token=YOUR_VALUE
6. Paste here

---

## Step 3 - Resolve the Agent ID

Skip if Step 1 produced an agentId.

Otherwise:
1. GET ${BASE}/api/agents (see API Reference below)
2. Filter to owned agents only (isOwn === true). Public agents return truncated payloads.
3. If filtered list is empty: "No owned agents found at ${BASE}. Create one in the UI, then re-run." Stop.
4. Render list as numbered markdown:
   ```
   You own N agent(s) at ${BASE}:

   1. <name> · <subagent-count> specialist(s) · model: <model> · <created date>
      └─ <id>
   2. ...
   ```
   Include: name (truncated to 60 chars), subagent count, model, createdAt date only. Limit to 20 most recent, note if elided.
5. Ask user to pick: accept 1-based number, full UUID, name (case-insensitive substring match, disambiguate if multiple), or "cancel"
6. Resolve reply into matching agent's id. Set agentId and continue to Step 4.

---

## Step 4 - Fetch State

All endpoints in API Reference below. Use curl --silent --show-error --fail-with-body.

1. **Agent**: GET ${BASE}/api/agents/<id>
   - 401: Cookie expired → drop cookie, return to Step 2
   - 403: Not owner → Stop: "This skill can only review agents you own — the public payload omits the system prompt and subagents"
   - 404: Bad ID → Ask user to confirm
   - 200: Parse JSON. Confirm has subagents, systemPrompt, steps (JSON string), starterPrompts (array) fields. If any missing, surface and stop.

2. **Datasets**: For each subagent with non-null datasetId, run in parallel:
   - GET ${BASE}/api/datasets/<datasetId> → aiInstructions, name, description, status, clusterDatasetId
   - GET ${BASE}/api/datasets/<datasetId>/status → totalEntries, byStatus, overall

3. **MCP catalog**: GET ${BASE}/api/mcps. Index by id for cross-referencing subagent.mcpIds[].

Store merged payload in memory as state object. Do not echo raw state to user.

---

## Step 5 - Compute the Assembled System Prompt

The platform receives:
```
if steps.length === 0:
  assembled = agent.systemPrompt
else:
  assembled = agent.systemPrompt + "\n\n# Steps\n\n" +
              steps.map((s, i) => `## Step ${i+1}: ${s.name}\n${s.prompt}`).join("\n\n")
```

Parse steps field (JSON-encoded string) before assembling. If steps is null or "[]", use systemPrompt verbatim.

This assembled string — NOT the raw fields — is what the orchestrator sees. All rubric prompt-quality checks run against the **assembled** string.

---

## Step 6 - Apply the Rubric

Apply every check below IN ORDER on the current state. For each finding, record:
- field path (e.g., agent.description, subagents[2].systemPrompt, datasets[0].aiInstructions)
- severity (🟢 pass / 🟡 warning / 🔴 error / ℹ️ info)
- suggested replacement — concrete proposed value, not vague advice

Maintain a proposed-state copy: deep-cloned mutable structure where every 🔴 and 🟡 suggestion is applied. ℹ️ findings are advisory only — do not modify proposed-state.

### RUBRIC - Layer 1: Agent Core Fields

**1.1 Name is generic or placeholder**
- Look for: agent.name matches /^(agent|untitled|new agent|test|my agent)$/i OR length < 3
- Severity: 🟡
- Suggest: Name derived from first sentence of systemPrompt (verb-noun, e.g., "Paper Summarizer", "Code Reviewer"). Max 60 chars.

**1.2 Description is empty**
- Look for: agent.description == null OR trimmed length 0
- Severity: 🟡
- Suggest: One-sentence summary from first 1-2 sentences of systemPrompt, <= 200 chars, no trailing period if noun phrase.

**1.3 Starter prompts missing or sparse**
- Look for: agent.starterPrompts.length < 3
- Severity: 🟡
- Suggest: 3-5 starter prompts, each as first message user would type. Derive from use cases in systemPrompt. Each 1-500 chars.

### RUBRIC - Layer 2: Assembled System Prompt + Steps

All checks run on the **assembled** string (systemPrompt + steps).

**2.1 Assembled prompt near model context limit**
- Look for: assembled length > 100000 chars (78% of 128k cap)
- Severity: 🟡
- Suggest: Identify longest step/section. Propose factoring into corpus or subagent systemPrompt instead of inlining.

**2.2 Step references subagent that doesn't exist**
- Look for: step.prompt mentions name (capitalized noun phrase or "ask the X specialist") where referenced name has no matching subagents[i].name (case-insensitive, slugify-equal)
- Severity: 🔴
- Suggest: Rename reference to match existing subagent OR add missing subagent

**2.3 Steps contradict overall prompt**
- Look for: Model judgement - step says "do X" while systemPrompt says "never do X"
- Severity: 🟡
- Suggest: Name contradiction explicitly. Propose resolution aligning with prompt's role.

**2.4 Steps duplicate overall prompt**
- Look for: systemPrompt contains numbered list (1. 2. 3.) covering same ground as steps[]
- Severity: 🟡
- Suggest: Remove inline list from systemPrompt OR clear steps[] - pick whichever is shorter

**2.5 Step is under-specified**
- Look for: any step.prompt trimmed length < 20 chars
- Severity: 🟡
- Suggest: Expand to describe input, action, expected output. Min ~80 chars.

**2.6 Step name is generic**
- Look for: step.name matches /^step \d+$/i OR in {"Start","Do it","Process","Next"}
- Severity: 🟡
- Suggest: Rename to verb-object phrase ("Extract key findings", "Validate input")

### RUBRIC - Layer 3: Specialist Subagents

Apply per subagent in subagents[]:

**3.1 Name slugifies to generic or numeric**
- Look for: slugify(subagent.name) in {"helper","assistant","specialist","tool","agent","subagent","worker"} OR slug is only digits OR slugify is empty
- Severity: 🔴 (digit/empty), 🟡 (generic word)
- Suggest: Rename to domain-specific noun phrase. Slugified name becomes task() tool name.

**3.2 Description is empty**
- Look for: subagent.description == null OR trimmed length < 10
- Severity: 🔴
- Suggest: 1-2 sentences: "Use this specialist when <trigger>. It can <capabilities>."

**3.3 System prompt under-specified**
- Look for: trimmed length < 100 chars
- Severity: 🔴
- Suggest: Expand to role + scope + tool-usage instructions + output format. Minimum ~300 chars.

**3.4 Capability/wiring mismatch**
- Look for: subagent.mcpIds parsed is empty AND systemPrompt contains: search, look up, fetch, retrieve, browse, query, find documents, find papers, recherche
- Severity: 🔴
- Suggest: Name the verb. Propose: wire correct MCP OR reword prompt to not promise unimplemented capabilities.

**3.5 mcpId references non-existent MCP**
- Look for: any id in subagent.mcpIds parsed missing from /api/mcps response
- Severity: 🔴
- Suggest: Name broken id. Next workflow rebuild fails in buildAgentWorkflow. Remove id OR recreate MCP.

**3.6 Orphan dispatch surface**
- Look for: slugified subagent name appears nowhere in assembled parent systemPrompt (case-insensitive substring across slug and original name)
- Severity: 🟡
- Suggest: Add sentence to parent's systemPrompt or step: "For <task type> questions, delegate to <subagent-name> specialist."

**3.7 Two subagents with overlapping capability**
- Look for: Model judgement - pairs with semantically near-duplicate descriptions or systemPrompts
- Severity: 🟡
- Suggest: Merge into one OR differentiate by naming distinct trigger condition in description.

**3.8 Subagent missing output-format declaration**
- Look for: systemPrompt contains none of: return, respond with, output, format your answer, JSON, markdown, structured
- Severity: 🟡
- Suggest: Append "Output format:" section describing exactly what parent should expect.

**3.9 Subagent overrides agent model without rationale**
- Look for: subagent.model differs from agent.model
- Severity: ℹ️
- Suggest: Surface pair to user. Sometimes intentional (heavier model for hard subtask), sometimes leftover. Ask, don't auto-fix.

### RUBRIC - Layer 4: Corpora

Apply per subagent with non-null datasetId, with matching dataset and datasetStatus:

**4.1 Corpus is not ready**
- Look for: dataset.status != "ready" OR datasetStatus.overall != "processed"
- Severity: 🔴
- Suggest: Corpus subagent returns empty results. Wait for processing, remove attachment, or investigate upload status.

**4.2 No aiInstructions**
- Look for: dataset.aiInstructions == null OR trimmed length 0
- Severity: 🟡
- Suggest: Write "## How to use this corpus" for dataset (PATCH /api/datasets/<id>): what's in corpus, when to search, how to interpret, how to cite. <= 8000 chars.

**4.3 Orphan corpus**
- Look for: dataset.name appears nowhere in assembled parent systemPrompt (case-insensitive, also try slug)
- Severity: 🟡
- Suggest: Add to parent's systemPrompt or step: "When user asks about <topic>, search the <dataset.name> corpus."

**4.4 Partial ingestion**
- Look for: datasetStatus.byStatus.error > 0
- Severity: 🟡
- Suggest: Name count ("N entries failed"). Tell user to inspect dataset detail page.

**4.5 Corpus subagent name unclear**
- Look for: corpus subagent name doesn't include dataset name or abbreviation. Default is "${dataset.name} Corpus"
- Severity: 🟡
- Suggest: Rename to "${dataset.name} Corpus" for orchestrator clarity.

### RUBRIC - Layer 5: Topology

**5.1 Too many subagents**
- Look for: subagents.length > 7
- Severity: 🟡
- Suggest: Identify candidates for merging (per 3.7) or removal (per 3.6). 5-7 is comfortable upper bound.

**5.2 Prompt mentions specialists but none wired**
- Look for: subagents.length == 0 AND assembled prompt mentions: specialist, subagent, expert, delegate, use the X tool, ask the X
- Severity: 🔴
- Suggest: Add subagents the prompt promises OR rewrite prompt to not promise delegation.

**5.3 Corpus attached but agent prompt generic**
- Look for: At least one corpus subagent exists AND agent systemPrompt contains no domain-specific term overlapping with dataset.name or description
- Severity: 🟡
- Suggest: Re-scope prompt to corpus domain OR detach corpus.

**5.4 No starter prompts AND no description**
- Look for: agent.starterPrompts.length == 0 AND agent.description empty/null
- Severity: 🔴
- Suggest: Published agent with neither is unusable from grid. Fill both per 1.2 and 1.3.

---

## Step 7 - Render the Report

Produce one assistant turn in this exact shape:

# Agent Review: <agent.name>

**Verdict**: <emoji> <one-line summary> - <R> red, <Y> yellow, <G> green findings
**Model**: <agent.model> · **Workflow**: <agent.workflowId> · **Subagents**: <n> · **Corpora**: <n>

## Core fields
<emoji> <field>: <finding>
  -> Suggest: <concrete replacement>

## System prompt (<N> / 128000 chars)
<emoji> ...

## Steps (<n>)
<emoji> ...

## Specialists (<n>)
### <slug> - <subagent.name>
  description: <subagent.description or "(empty)">
  prompt: <first 200 chars>...
  mcps: <comma-separated MCP names, or "(none)">
  Findings:
  <emoji> ...

## Corpora (<n>)
### <dataset.name> (status: <dataset.status>, <totalEntries> entries)
  aiInstructions: <first 100 chars or "(empty)">
  Findings:
  <emoji> ...

## Topology
<emoji> ...

---

Ready to propose fixes. Reply to discuss any finding, or say `diff` to see a per-field before/after, or `json` to see the full PUT payload.

**Constraints:**
- Verdict emoji = 🔴 if any 🔴, else 🟡 if any 🟡, else 🟢
- Sections with zero findings still appear with "🟢 nothing to flag"
- Suggestions inline next to findings - never deferred
- Truncate prompts to 200 chars in report
- Do NOT ask any question at end of this step

---

## Step 8 - Discussion Loop

If user replies in free text (not diff or json):
- Treat as feedback on specific findings
- "Ignore the description finding" → drop that edit from proposed-state
- "Change suggestion for X to Y" → update proposed-state with Y
- "Add starter prompt for ABC" → add to proposed-state

After applying feedback, re-state only **changes to proposed-state** since last turn (1-3 lines), then re-invite: say `diff` or `json` or continue chatting.

Stay in loop until user says `diff` or `json`.

---

## Step 9 - Proposal: Diff or JSON

When user says `diff`, `json`, or "show me the changes":

If they haven't picked, use ask_user_question (header: "View", 2 options):
- Annotated diff - recommended for reviewing changes by hand
- JSON payload - recommended for piping to curl or applying programmatically

### Diff View

For each field that differs from original state, render:
```
## <field path>
- <old value, one line per newline>
+ <new value, one line per newline>
```

Order: agent core fields → steps[] (whole array) → each subagent in original index order → topology last.

If proposed change is to dataset's aiInstructions, render under separate "## Out-of-scope (manual)" heading with ready-to-paste curl -X PATCH command. Datasets not in agent PUT payload.

### JSON Payload View

Render exactly the body that PUT /api/agents/:id accepts (see API Reference). Critical points:
- Echo every subagent user owns, including untouched ones (omitting wipes them)
- steps[] must be present (possibly [])
- subagents[] must be present (possibly [])
- isForkable: echo current state unless user explicitly changed
- Date fields: only include if user is changing (YYYY-MM-DD format)
- datasetId on subagents: preserve from state

Output as single fenced ```json``` block. Then add: "Ready to apply this payload. Say 'apply' to PUT, or 'back' to switch views."

---

## Step 10 - Confirmed PUT-back

When user says `apply` / "yes" / "go":

Render the diff one final time (even if just saw JSON) and use ask_user_question (header: "Apply", 3 options):
- Apply now - proceed with PUT
- Modify first - drop back to Step 8
- Skip - print the curl - print ready-to-run curl -X PUT with Cookie: $ALIEN_AGENTS_COOKIE as placeholder (never literal value), then stop

If user picks **Apply now**:
1. Write JSON body to tempfile: /tmp/agent-review-<id>.json
2. Run:
   ```bash
   curl --silent --show-error --fail-with-body -w '\n%{http_code}' \
        -X PUT "${BASE}/api/agents/<id>" \
        -H "Cookie: $COOKIE" \
        -H "Content-Type: application/json" \
        -d @/tmp/agent-review-<id>.json
   ```
3. Capture response and HTTP status
4. Delete tempfile after call returns

Outcomes:
- 2xx: Confirm success, name changed fields, remind: "Ongoing conversations will pick up the new graph on the next turn."
- 400: Zod validation failed. Surface response body verbatim, offer to drop back to Step 8
- 401: Cookie expired. Drop cookie, offer to re-run Step 2
- 403: Ownership changed. Stop
- 409 / AgentWorkflowNotFoundError: Surface exact message. Do not retry
- 5xx: Surface status + body, stop

Never retry on failure.

---

## Guardrails

- Read-only by default: Steps 3-9 issue only GET requests. Only Step 10 may issue PUT, and only after explicit ask_user_question confirmation.
- No PATCH of datasets: Flag issues with dataset.aiInstructions but never write to /api/datasets/:id. If user accepted corpus-prompt suggestion, surface the curl for manual run.
- No retries: Every failure stops and waits for user input.
- Cookie hygiene: Hold cookie in shell variables only; never persist; never include in rendered output.
- No invented fields: PUT body must match UpdateAgentData schema exactly (see API Reference).
- Truncate aggressively in chat: Full prompts can be 100k+ chars. Never paste them back - always truncate to 200 chars in report, render full only inside diff blocks and JSON payload.

---

## API Reference

**Endpoints:**
- GET /api/agents - List own + public agents
- GET /api/agents/:id - Owner-view agent payload (public subset for non-owners)
- GET /api/datasets/:id - Dataset detail including aiInstructions
- GET /api/datasets/:id/status - Per-entry status counts
- GET /api/mcps - User-visible MCP catalog
- PUT /api/agents/:id - Full-replace update

**Error handling:**
- 401: Cookie missing/expired → re-resolve cookie (Step 2)
- 403: Not owner → stop, public payload insufficient
- 404: Bad ID → ask user to confirm
- 400: Zod validation failed on PUT → surface response, names failing field
- 409: AgentWorkflowNotFoundError → surface verbatim, do not retry
- 5xx: Platform failure → surface status + body, stop

**Payload Shapes:**

AgentResponse (owner view of GET /api/agents/:id):
```typescript
{
  id: string;
  userId: string;
  workflowId: number | null;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  steps: string | null;              // JSON-encoded string of StepData[]
  starterPrompts: string[];          // Already parsed by route handler
  model: string | null;
  author: string | null;
  isPublic: boolean;
  isForkable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  subagents: Array<{
    id: string;
    agentId: string;
    name: string;                    // SLUGIFIED -> task() tool name
    systemPrompt: string;
    model: string | null;
    mcpIds: string | null;           // JSON-encoded string of string[]
    datasetId: string | null;        // non-null = corpus subagent
    nodeId: string | null;
    createdAt: string | null;
  }>;
}
```

DatasetDetailResponse (GET /api/datasets/:id):
```typescript
{
  id: string;
  userId: string;
  clusterDatasetId: number | null;
  name: string;
  description: string | null;
  aiInstructions: string | null;
  status: "pending" | "processing" | "ready" | "error" | null;
  isPublic: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  attachedAgents: Array<{ id: string; name: string | null; }>;
}
```

DatasetStatusResponse (GET /api/datasets/:id/status):
```typescript
{
  datasetId: string;
  totalEntries: number;
  byStatus: { pending: number; uploading: number; uploaded: number; processing: number; processed: number; error: number; };
  overall: "empty" | "uploading" | "processing" | "processed" | "error";
}
```

McpListResponse (GET /api/mcps):
```typescript
Array<{
  id: string;
  userId: string;
  name: string;
  serverUrl: string;
  transport: "streamable_http" | "sse" | "stdio" | null; // only "streamable_http" is supported by the platform's MCP node; sse/stdio fail at runtime
  authToken: string | null;
  description: string | null;
  categories: string[];
  type: string | null;
  provider: string | null;
  pricePerQuery: string | null;
  enabled: boolean | null;
  isPublic: boolean;
}>;
```

UpdateAgentData (PUT /api/agents/:id body):
```typescript
{
  name: string;                         // 1-120 chars, trimmed non-empty
  description?: string | null;          // max 2000 chars
  author?: string | null;              // max 120 chars
  createdAt?: string;                  // YYYY-MM-DD, only if changing
  systemPrompt: string;                // max 128000 chars
  steps: Array<{                       // REQUIRED - present even if empty
    name: string;                      // 1-120
    prompt: string;                    // 1-16000
  }>;
  starterPrompts?: string[];           // each 1-500 chars
  model: string;                       // 1-120
  subagents: Array<{                   // REQUIRED - present even if empty
    name: string;                      // 1-120
    description?: string;              // max 2000
    systemPrompt: string;              // 1-128000
    model: string;                     // 1-120 - REQUIRED on subagents
    mcpIds: string[];                  // defaults to []
    datasetId?: string | null;         // PRESERVE for corpus subagents
  }>;
  isForkable: boolean;                 // defaults to false; echo if unchanged
}
```

**Critical gotchas:**
- subagents[] is full-replace. Platform deletes existing and reinserts. Echo EVERY subagent.
- steps[] is full-replace. Same rule.
- datasetId must be preserved on corpus subagents. Dropping it orphans the subagent.
- subagents[].mcpIds: GET returns JSON-encoded string, PUT expects string[]. Parse on read, send as array on write.
- steps: GET returns JSON-encoded string, PUT expects array. Parse on read, send as array on write.
- starterPrompts: Already parsed array on GET, send as plain array on PUT.

**Assembled system prompt (what orchestrator sees):**
```
if steps.length === 0:
  assembled = agent.systemPrompt;
else:
  assembled = agent.systemPrompt + "\n\n# Steps\n\n" +
              steps.map((s, i) => `## Step ${i+1}: ${s.name}\n${s.prompt}`).join("\n\n");
```

**Slugify helper (for subagent names):** lowercase, NFKD strip-accents, non-alphanumeric → -, trim, max 40 chars.
