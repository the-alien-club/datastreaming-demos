---
name: create-agent
description: Design and create a new Alien Agent end-to-end. Use when the user invokes /create-agent, asks to build/design/scaffold a new Alien Agent, or asks for help configuring an agent's prompts, specialists, MCPs, or corpora. Starts by cataloging what's already available to the user (agents, specialists, datasets, MCPs), runs an open-ended discussion about the agent's purpose, flags gaps (missing MCPs or corpora), produces a complete draft config, then provisions everything via the API on explicit confirmation.
---

# Create Alien Agent

You are designing a brand-new Alien Agent with the user, then provisioning it via the API. The skill has two phases: **discovery + design** (read-only) and **provision** (writes — gated by explicit confirmation).

The construction quality bar is the same one the `review-agent` skill uses to flag problems — see [../review-agent/RUBRIC.md](../review-agent/RUBRIC.md). Read it before composing the draft (Step 6). Build to *avoid* every 🔴 and 🟡 in that rubric.

The exact API contracts — both reads and writes — live in [API.md](API.md). Read it before any HTTP call.

---

## Step 1 — Resolve auth

Same flow as `review-agent`. Read `ALIEN_AGENTS_COOKIE` and `ALIEN_AGENTS_BASE_URL` from env:

```bash
echo "${ALIEN_AGENTS_COOKIE:-}"
echo "${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}"
```

If `ALIEN_AGENTS_COOKIE` is empty, run `node scripts/get-session.mjs --base-url "$BASE_URL"` from the alien-agents repo root. Branch on exit code:

- **0** — stdout is `<name>=<value>`. Capture into memory; pass on every `curl -H "Cookie: $COOKIE"`.
- **127** (Playwright missing) — surface stderr verbatim. Ask via `AskUserQuestion` (header "Auth", 2 options): (a) install Playwright themselves, (b) sign in via browser and paste the `session_token` cookie value.
- **other non-zero** — surface stderr; offer the manual-paste path.

Never log, write, or echo the cookie to the user.

## Step 2 — Build the catalog

Fetch what's already available to the user in parallel (Bash `&` + `wait`, or sequential — these are small responses):

```bash
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/agents"         > /tmp/cat-agents.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/specialists"    > /tmp/cat-specs.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/datasets"       > /tmp/cat-datasets.json
curl --silent --show-error -H "Cookie: $COOKIE" "${BASE}/api/mcps"           > /tmp/cat-mcps.json
```

Build an in-memory `catalog` object:

```
catalog = {
  agents:      AgentListResponse (filter isOwn or include public — both useful as inspiration),
  specialists: SpecialistListResponse,     // reusable subagent templates
  datasets:    DatasetListItem[],          // ready / processing / error
  mcps:        McpListResponse,            // plus the built-in "datacluster" id
}
```

If any GET fails (401 / 5xx), surface and stop. The skill cannot design without knowing what's available.

## Step 3 — Present the catalog

Render a concise summary in one assistant turn. Tables, not full dumps. Truncate descriptions to one line.

```
# Available to you on <BASE>

**MCPs** (N total):
| id | name | provider | description |
|---|---|---|---|
| datacluster | Data Cluster | (built-in) | Corpus search for attached datasets |
| <id> | <name> | <provider> | <description, ≤80 chars> |
...

**Datasets** (M total, K ready):
| name | status | entries | aiInstructions? |
|---|---|---|---|
| <name> | <status> | <count or "—"> | <yes/no> |
...

**Specialists** (P total reusable templates):
| name | model | mcps | description |
|---|---|---|---|
| <name> | <model> | <comma-list of mcp ids> | <description, ≤80 chars> |
...

**Your existing agents** (Q total, for inspiration):
| name | subagents | model |
|---|---|---|
| <name> | <count> | <model> |
...
```

Below the tables, end with one question:

```
What would you like to build? Describe the agent's purpose in your own words —
the domain, who uses it, the kinds of tasks it should handle. I'll ask
follow-ups as needed.
```

Stop and wait.

## Step 4 — Open discussion loop

Gather enough about the agent's purpose to compose a coherent draft. Topics to surface, in rough priority order — pick the ones the user hasn't volunteered:

- **Domain / role** — what subject matter is this agent expert in?
- **Audience** — who's asking it questions? (general public, legal practitioners, internal team, etc.)
- **Core tasks** — 2-5 concrete things it should be able to do.
- **Tools needed** — does it need to search the web? Look things up in a specific corpus? Run code? Translate?
- **Output format expectations** — long-form answers? Structured JSON? Citations?
- **Constraints / refusals** — what should it NOT do?

Ask one or two questions per turn — don't quiz the user with a checklist. Follow their lead.

When you have enough to draft (typically after 2-4 turns), say so explicitly:

```
I have enough to draft an agent. Before I do, here's what I'm planning to
match against the catalog — confirm or correct any of it.
```

…then summarise in 4-6 bullets.

## Step 5 — Gap analysis

Compare the user's stated needs to the catalog. For each capability needed, classify:

- **🟢 Covered by catalog** — an existing MCP / dataset / specialist matches; reuse it.
- **🟡 Partial match** — something close exists, but might need an aiInstructions update or a wrapper subagent.
- **🔴 Gap** — no existing resource covers this need.

Render as:

```
## Capability mapping

🟢 Web search → use MCP "<existing-mcp-name>"
🟢 Legal-corpus retrieval → use dataset "<existing-dataset>" (status: ready, N entries)
🟢 Citation formatting → wrap as inline subagent (no external tool needed)

🔴 Translation EN→FR → no MCP in catalog provides this
🔴 Case-law corpus → no dataset in catalog covers this domain
```

For each 🔴 gap, ask via `AskUserQuestion` (one question per gap, header "Gap", max 4 options):

- **Provision via API** — for an MCP, I'll create the entry now if you give me the server URL + transport. For a dataset, I'll create an empty dataset row; you upload files via the UI; come back when ready.
- **Skip — proceed without** — note the gap in the agent's description and proceed with reduced scope.
- **Stop — let me set this up first** — exit the skill; user provisions in the UI, then re-invokes.

Collect the user's decisions per gap before proceeding. If they chose "Stop" on any gap, exit gracefully.

## Step 6 — Compose the draft

Now compose the full agent config. Read [../review-agent/RUBRIC.md](../review-agent/RUBRIC.md). Build to *pass* every check in that rubric. Specifically:

- **name** (1.1): verb-noun phrase, domain-specific, ≤60 chars.
- **description** (1.2): one sentence, derivable from the system prompt's first lines, ≤200 chars.
- **systemPrompt** (1.4-1.6, 2.x): starts with "You are <role>." Includes: scope, audience, capabilities (referencing the subagents and corpora by their actual names), output format, constraints / refusals. Aim for 500-1500 chars on the overall prompt; use `steps[]` for procedural breakdowns.
- **steps[]** (2.5, 2.6): only add if there's a meaningful procedural breakdown. Each step name = verb-object phrase. Each `prompt` ≥80 chars describing input/action/output.
- **starterPrompts** (1.3): 3-5 prompts as first-message text a user would type. Derived from the use cases the system prompt mentions.
- **subagents** (Layer 3):
  - For each gap a specialist covers: include an inline subagent (do NOT POST a specialist — those are reusable templates the user manages separately).
  - For each 🟢 / 🟡 specialist reuse the user picked: copy that specialist's `name`, `systemPrompt`, `model`, `mcpIds` into the new agent's `subagents[]`. The skill does not link to specialists by reference; it inlines their config.
  - For each dataset attachment: do NOT include a corpus subagent in the initial POST body — those are auto-generated by `POST /api/datasets/:id/attach` after the agent exists.
  - Every subagent: name is dispatchable noun phrase, description is "Use this specialist when X. It can Y.", systemPrompt declares role + scope + tool usage + output format, mcpIds are non-empty if the prompt promises tool use.
- **model**: default to `gpt-4.1-mini`. Upgrade to a stronger model only if the assembled prompt mentions long-document reasoning, multi-step planning, deep research, code generation, or math (rubric check 1.7).

Hold the draft in an internal `draft` object:

```
draft = {
  agent: <CreateAgentData body>,
  mcpsToCreate: <CreateMcpBody[]>,      // from gap analysis where user picked "Provision"
  datasetsToCreate: <CreateDatasetData[]>,   // ditto, empty rows for later UI upload
  datasetsToAttach: <{ id: string }[]>, // 🟢 dataset reuses
}
```

## Step 7 — Present + confirm

Render the full proposed plan in one assistant turn:

```
# Proposed agent

**Name**: <draft.agent.name>
**Description**: <draft.agent.description>
**Model**: <draft.agent.model>

## System prompt (<N> chars)
<full text, fenced ```` ``` ```` block>

## Steps (<n>)
1. **<name>** — <first 200 chars>
...

## Starter prompts (<n>)
- <prompt 1>
- ...

## Specialists (<n>)
### `<slug>` — <name>
**When to dispatch**: <description>
**MCPs**: <comma list, or "(none)">
**Prompt** (<N> chars):
<first 300 chars>…

## Provisioning order
1. Create N new MCP(s): <names>
2. Create M new (empty) dataset(s): <names>  ← you upload files via UI afterwards
3. Create the agent
4. Attach K existing dataset(s): <names>
```

Then `AskUserQuestion` (header "Apply", 3 options):

- **Apply now** — proceed with Step 8.
- **Modify first** — drop back into chat; user describes changes; update `draft`; re-render.
- **Cancel** — discard the draft, exit.

## Step 8 — Provision via API

Execute sequentially, in this exact order. Stop on the first failure (do not retry, do not roll back — give the user a precise state report so they can recover by hand).

### 8a. Create new MCPs

For each entry in `draft.mcpsToCreate`:

```bash
curl --silent --show-error --fail-with-body \
  -X POST "${BASE}/api/mcps" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<CreateMcpBody JSON>'
```

Capture the returned `id` and rewrite any references in `draft.agent.subagents[].mcpIds` from the placeholder ("__new-mcp-N__") to the real id.

### 8b. Create new empty datasets

For each entry in `draft.datasetsToCreate`:

```bash
curl --silent --show-error --fail-with-body \
  -X POST "${BASE}/api/datasets" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<CreateDatasetData JSON>'
```

Capture the returned `id`. After all are created, surface the UI URL for each:

```
Upload files for these datasets in the UI before re-running attachment:
  - <name>: ${BASE}/datasets/<id>
```

Then ask via `AskUserQuestion` (header "Uploads", 2 options):

- **Done — proceed with attach** — skill continues to 8d for these datasets too.
- **Skip attach — I'll come back later** — skill skips 8d for new datasets; user attaches via `/api/datasets/<id>/attach` when ready.

### 8c. Create the agent

```bash
curl --silent --show-error --fail-with-body \
  -X POST "${BASE}/api/agents" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '<CreateAgentData JSON>'
```

Capture the returned agent's `id`.

### 8d. Attach datasets

For each `dataset.id` in `draft.datasetsToAttach` (plus newly-created datasets the user said "Done" on):

```bash
curl --silent --show-error --fail-with-body \
  -X POST "${BASE}/api/datasets/<dataset-id>/attach" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '{"agentId":"<agent-id>"}'
```

### 8e. Surface the result

Print a single closing message:

```
✅ Agent created.

  Name: <name>
  URL:  ${BASE}/agents/<agent-id>
  Edit: ${BASE}/agents/<agent-id>

Provisioned:
  - N new MCP(s)
  - M new dataset row(s) — upload files via the UI
  - K dataset(s) attached
  - L specialist subagent(s) inlined

Next:
  - Open the agent and run a starter prompt to sanity-check the dispatch.
  - Use /review-agent <agent-id> to audit the result.
```

---

## Error handling

| Status | Where | Action |
|---|---|---|
| 401 | any | Cookie expired. Drop it, return to Step 1. |
| 400 | any POST | Zod validation failed. Surface body verbatim — it names the failing field. Offer "Fix and retry" (drop back to Step 6) or "Abort". |
| 409 | POST /agents | Workflow already exists for this slug. The skill uses `crypto.randomUUID()` slugs server-side — this should not happen. Surface and stop. |
| 5xx | any | Surface status + body, stop. |

When provisioning fails mid-flow (e.g. 8c succeeds but 8d fails for one dataset), report exactly what succeeded and what didn't, so the user can finish manually:

```
⚠️ Partial provisioning:
  ✅ Agent created: <id>
  ✅ Attached: <dataset-a>
  ❌ Failed to attach <dataset-b>: <error message>

To retry the attach manually:
  curl -X POST "${BASE}/api/datasets/<dataset-b>/attach" \
       -H "Cookie: $ALIEN_AGENTS_COOKIE" -H "Content-Type: application/json" \
       -d '{"agentId":"<agent-id>"}'
```

---

## Guardrails

- **Read-only by default.** Steps 1-7 issue only `GET` requests. Step 8 is the only place `POST` happens, and only after the explicit confirmation in Step 7.
- **No PUT, no DELETE, no PATCH.** The skill never modifies existing resources. If the user wants to update an existing agent, redirect them to `/review-agent`.
- **No file uploads.** Multipart uploads are out of scope; the skill creates empty dataset rows and points the user at the UI.
- **No specialist creation.** Specialists are reusable templates the user manages elsewhere. The skill *reads* specialists to copy their config inline, but never POSTs to `/api/specialists`.
- **Cookie hygiene.** As with review-agent — never log, never persist, never include in chat output.
- **Truncate aggressively.** Catalog tables truncate descriptions to ≤80 chars. Specialist prompt previews ≤300 chars. Full content only in the Step 7 "proposed agent" block.
- **No invented fields.** Every POST body must validate against the Zod schema in [API.md](API.md). Any field not in the schema is a bug.
