---
name: review-agent
description: Holistically review a published Alien Agent — system prompt, ordered steps, specialist subagents (names, descriptions, prompts, MCP wiring), attached corpora, and graph topology. Use when the user invokes /review-agent with an agent ID or URL, asks to audit/review/critique an Alien Agent, or asks how to improve an agent. Renders a structured chat report, then offers an annotated diff OR a full JSON payload of proposed fixes, then optionally PUTs the update back via /api/agents/:id with explicit confirmation.
---

# Review Alien Agent

You are reviewing an Alien Agent end-to-end. The user invokes this skill with either a bare agent UUID, an agent URL (e.g. `https://agents.alien.club/fr/agents/<uuid>`), or no argument (ask).

The review must cover four layers — **agent core fields**, the **assembled system prompt** (overall + steps), every **specialist subagent**, every attached **corpus** — plus a topology check. The complete check rubric lives in [RUBRIC.md](RUBRIC.md). The exact API contracts live in [API.md](API.md). Read both before fetching state.

You drive the entire flow. Do not delegate review judgements to a sub-LLM call — apply the rubric inline.

---

## Step 1 — Parse the argument (if any)

The user may supply one of:

- A bare UUID: `8f4e1c2a-…`
- An agent page URL: `…/agents/<uuid>` or `…/agents/<uuid>/chat[/...]`. Extract the UUID via regex; the locale prefix is irrelevant.
- **Nothing** — in which case Step 3 will fetch the list of agents the user owns and let them pick.

Do not error out on a missing argument. Just remember that `agentId` is unresolved and continue.

## Step 2 — Resolve auth

The chatbot's API requires a better-auth session cookie. No bearer-token path exists. Resolve in this order:

1. Read `ALIEN_AGENTS_COOKIE` and `ALIEN_AGENTS_BASE_URL` from the environment:
   ```bash
   echo "${ALIEN_AGENTS_COOKIE:-}"
   echo "${ALIEN_AGENTS_BASE_URL:-https://demo.legaldataspace.eu}"
   ```
   If `ALIEN_AGENTS_BASE_URL` is unset, default to `https://demo.legaldataspace.eu` (the demo deployment). Users doing local development should `export ALIEN_AGENTS_BASE_URL=http://localhost:3000` before invoking the skill.

2. If `ALIEN_AGENTS_COOKIE` is **set and non-empty**, use it directly. Do not invoke the helper script.

3. If it is empty, run the helper from the alien-agents repo root:
   ```bash
   node scripts/get-session.mjs --base-url "$BASE_URL"
   ```
   Branch on the exit code:
   - **0** — stdout is one line `<name>=<value>`. Capture it into an in-memory variable (do not write to disk, do not echo it back to the user). Use this value as the `Cookie:` header for every subsequent `curl`.
   - **127** (Playwright not installed) — show the script's stderr verbatim, then ask via `AskUserQuestion` (header "Auth", 2 options):
     - "Install Playwright now" — instruct the user to run `npm install && npx playwright install chromium` themselves, then retry the skill. Stop here.
     - "Paste cookie manually" — instruct the user to sign in via their browser, open devtools → Application → Cookies, find the cookie whose name contains `session_token`, and paste `name=value` into chat. Use the pasted value for this session.
   - **any other non-zero** — show stderr verbatim and offer the same "Paste cookie manually" path.

Cookie handling: never log it, never include it in any chat-rendered output, never write it to a file. Pass it only on `curl -H "Cookie: $COOKIE"` lines.

## Step 3 — Resolve the agent ID (if not supplied)

Skip this step entirely if Step 1 produced an `agentId`.

Otherwise:

1. `GET ${BASE}/api/agents` (see [API.md](API.md)). The response is an array of agents; each carries `isOwn: boolean`.

2. Filter to owned agents only (`isOwn === true`). Public agents from other users return a truncated payload (no system prompt, no subagents) on `GET /api/agents/:id`, so the skill can't review them.

3. If the filtered list is empty: tell the user "No owned agents found at `${BASE}`. Create one in the UI, then re-run." Stop.

4. Render the list in chat as a numbered Markdown list:

   ```
   You own N agent(s) at <BASE>:

   1. <name> · <subagent-count> specialist(s) · model: <model> · <created date>
      └─ <id>
   2. ...
   ```

   For each row include: `name`, subagent count (parse the agent's `subagents.length`), `model`, and `createdAt` (just the date part). Truncate `name` to 60 chars. Limit the list to 20 entries — if there are more, render the 20 most recently updated and tell the user how many were elided.

5. Ask the user to pick. Accept any of: a 1-based number from the list, a full UUID, a name (case-insensitive substring match — disambiguate by re-asking if multiple match), or "cancel" to stop.

   Resolve their reply into the matching agent's `id`. Set `agentId` accordingly and continue to Step 4.

## Step 4 — Fetch state

All endpoints are documented in [API.md](API.md). Run these with `curl --silent --show-error --fail-with-body`:

1. **Agent**: `GET ${BASE}/api/agents/<id>`.
   - On `401`: cookie expired or invalid. Tell the user, drop the cookie, return to Step 2.
   - On `403`: caller is not the owner. The public-view payload is insufficient for a full review (no system prompt, no subagents). Stop and tell the user: "This skill can only review agents you own — the public payload omits the system prompt and subagents."
   - On `404`: bad agent ID. Ask the user to confirm.
   - On `200`: parse the JSON. Confirm the response has `subagents`, `systemPrompt`, `steps` (JSON string), `starterPrompts` (already-parsed array) fields — if any are missing, the deployment is older than this skill assumes; surface that and stop.

2. **Datasets**: for each `subagent` whose `datasetId` is non-null, run two calls in parallel:
   - `GET ${BASE}/api/datasets/<datasetId>` → carries `aiInstructions`, `name`, `description`, `status`, `clusterDatasetId`.
   - `GET ${BASE}/api/datasets/<datasetId>/status` → carries `totalEntries`, `byStatus`, `overall`.

3. **MCP catalog**: `GET ${BASE}/api/mcps`. Index by `id` so each subagent's `mcpIds[]` can be cross-referenced.

Store the merged payload in memory as a single `state` object. Do not echo raw state back to the user — the next step is the rendered report.

## Step 5 — Compute the assembled system prompt

The platform receives `assembleSystemPrompt(overall, steps)`:

```
if steps.length === 0:
  assembled = agent.systemPrompt
else:
  assembled = agent.systemPrompt + "\n\n# Steps\n\n" +
              steps.map((s, i) => `## Step ${i+1}: ${s.name}\n${s.prompt}`).join("\n\n")
```

The `steps` field in the agent payload is a **JSON-encoded string** of `[{name, prompt}]`. Parse it before assembling. If `steps` is null or `"[]"`, use the overall prompt verbatim.

This assembled string — not the raw fields — is what the orchestrator sees. The rubric's prompt-quality checks run against the **assembled** string.

## Step 6 — Apply the rubric

Read [RUBRIC.md](RUBRIC.md). Walk through every check in order, on the current `state`. For each finding, record:

- **field path** (e.g. `agent.description`, `subagents[2].systemPrompt`, `datasets[0].aiInstructions`) — so the user can locate it in the edit UI.
- **severity** (🟢 / 🟡 / 🔴).
- **suggested replacement** — a concrete proposed value, not vague advice. The rubric supplies a suggestion template per check; fill it in based on the agent's actual content.

Keep an internal **proposed-state** copy of the agent: a deep-cloned mutable structure where every 🔴 and 🟡 suggestion is applied. ℹ️-level findings stay as advisory notes only — they do not modify proposed-state.

You will refine this proposed-state in Step 8 based on user feedback.

## Step 7 — Render the report in chat

Produce one assistant turn in this exact shape:

```
# Agent Review: <agent.name>

**Verdict**: <emoji> <one-line summary> — <R red>, <Y yellow>, <G green> findings
**Model**: <agent.model> · **Workflow**: <agent.workflowId> · **Subagents**: <n> · **Corpora**: <n>

## Core fields
<emoji> <field>: <finding>
  → Suggest: <concrete replacement>

## System prompt (<N> / 128 000 chars)
<emoji> ...

## Steps (<n>)
<emoji> ...

## Specialists (<n>)
### `<slug>` — <subagent.name>
  description: <subagent.description or "(empty)">
  prompt: <first 200 chars of subagent.systemPrompt>…
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
```

Constraints:

- The verdict emoji = 🔴 if any 🔴 findings, else 🟡 if any 🟡, else 🟢.
- Sections with zero findings still appear, with `🟢 nothing to flag`.
- Suggestions are inline next to their finding — never deferred.
- Truncate long prompts to 200 chars in the report; never paste the full prompt back at the user.

Do **not** ask any question at the end of this step. The user reads, then either replies in free text or says one of the trigger words.

## Step 8 — Discussion loop (optional)

If the user replies in free text (not `diff` or `json`):

- Treat their reply as feedback on specific findings. Common patterns:
  - "Ignore the description finding" → drop that finding's edit from proposed-state.
  - "Change the suggestion for X to Y" → update proposed-state with their value.
  - "Add a starter prompt for ABC" → add it to proposed-state.
- After applying their feedback, re-state only the **changes to proposed-state** since the last turn (1-3 lines), then re-invite them to say `diff` or `json` or continue chatting.

Stay in this loop until the user says `diff` or `json`.

## Step 9 — Proposal: diff or JSON

When the user says `diff`, `json`, or "show me the changes":

If they haven't picked, ask via `AskUserQuestion` (header "View", 2 options):

- **Annotated diff** — recommended when reviewing changes by hand. Per-field before/after blocks.
- **JSON payload** — recommended when piping to curl or applying programmatically. The full `PUT /api/agents/:id` body.

Render the chosen view from proposed-state:

### Diff view

For each field that differs from the original `state`, render one block:

```
## <field path>
- <old value, one line per actual newline>
+ <new value, one line per actual newline>
```

Order: agent core fields → `steps[]` (whole array if any change) → each subagent in original index order → topology-only changes go last.

If a proposed change is to the dataset's `aiInstructions`, render it under a separate `## Out-of-scope (manual)` heading with a ready-to-paste `curl -X PATCH ${BASE}/api/datasets/<id> ...` command — datasets are not part of the agent PUT payload.

### JSON payload view

Render exactly the body that `PUT /api/agents/:id` accepts. The Zod schema (`updateAgentSchema`) is documented in [API.md](API.md). Critical points:

- Echo back **every** subagent the user owns, including ones with no proposed changes. Omitting wipes them.
- `steps[]` must be present (possibly `[]`).
- `subagents[]` must be present (possibly `[]`).
- `isForkable` — echo from current `state.agent.isForkable` unless the user explicitly changed it.
- Date fields (`createdAt`) — only include if the user is changing them (must be `YYYY-MM-DD` format).
- `datasetId` on subagents — preserve from `state`; the PUT round-trip relies on it.

Output as a single fenced ```json``` block. Then add one line below: `Ready to apply this payload. Say "apply" to PUT, or "back" to switch views.`

## Step 10 — Confirmed PUT-back

When the user says `apply` / "yes" / "go":

Render the diff one final time (even if the user just saw the JSON view) and ask via `AskUserQuestion` (header "Apply", 3 options):

- **Apply now** — proceed with the PUT.
- **Modify first** — drop back to Step 8.
- **Skip — print the curl** — print a ready-to-run `curl -X PUT` with `Cookie: $ALIEN_AGENTS_COOKIE` as a placeholder (never the literal cookie value), then stop.

If the user picks **Apply now**:

1. Write the JSON body to a tempfile (e.g. `/tmp/agent-review-<id>.json`) so the `curl` command stays readable in transcripts.
2. Run:
   ```bash
   curl --silent --show-error --fail-with-body \
        -X PUT "${BASE}/api/agents/<id>" \
        -H "Cookie: <cookie>" \
        -H "Content-Type: application/json" \
        -d @/tmp/agent-review-<id>.json
   ```
3. Capture the response and HTTP status separately (use `-w '\n%{http_code}'` and split).
4. Delete the tempfile after the call returns, regardless of outcome.

Outcomes:

- **2xx** — confirm success in one line, name the changed fields, and remind the user: "Ongoing conversations will pick up the new graph on the next turn." Do not paste the full response body back.
- **400** — Zod validation failed. Surface the response body verbatim (it includes the failing field path) and offer to drop back to Step 8.
- **401** — cookie expired mid-flow. Drop the cookie and offer to re-run Step 2.
- **403** — ownership changed mid-flow. Stop.
- **409 / `AgentWorkflowNotFoundError`** — the platform workflow is gone. Surface the exact message from `AgentWorkflowNotFoundError`: *"Workflow N not found on the platform. The agent may need to be deleted and recreated."* Do not retry.
- **5xx** — surface the status and body, stop.

Never retry on failure. The user inspects and decides.

---

## Guardrails

- **Read-only by default.** Steps 3-9 issue only `GET` requests. Only Step 10 may issue `PUT`, and only after an explicit `AskUserQuestion` confirmation.
- **No PATCH of datasets.** The skill flags issues with `dataset.aiInstructions` but never writes to `/api/datasets/:id`. If the user accepted a corpus-prompt suggestion, surface the curl for them to run manually.
- **No retries.** Every failure stops the flow and waits for user input.
- **Cookie hygiene.** Hold the cookie in shell variables only; never persist it; never include it in rendered output.
- **No invented fields.** The PUT body must match `updateAgentSchema` exactly. Any field not in the schema is a bug.
- **Truncate aggressively in chat.** Full prompts can be 100k+ chars. Never paste them back — always truncate to 200 chars in the report, render full content only inside diff blocks and the JSON payload.
