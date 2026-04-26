# Start Wizard — Implementation Plan

**Branch**: `feature/lds-chatbot-start-wizard`
**Status**: Implemented + QA-verified (Playwright, three rounds). Ready for review.

## Goal

A 6-step onboarding wizard that takes a first-time user from "I see an empty Agents page" to "I'm chatting with a working legal AI agent" — modeled after the `web-app` Wizard / Step / WizardSteps primitives.

## Audience

Client stakeholders evaluating the Alien platform via the FDE demo, with the current named client being a French legal dataspace operator. UX must read as polished and decisive. Non-technical evaluators included.

## Trigger

- **Primary**: a primary-styled "Start" button at the top of the left sidebar (`Sparkles` icon, gradient). Always visible — discoverability for first-timers, also lets returning users spawn additional agents.
- **Auto-open**: on `/agents`, if `agentList.length === 0` and `localStorage.getItem("lds-chatbot:start-wizard-seen")` is null, the wizard opens once. The flag is set when the user reaches the Done step.

## Presentation

`shadcn` Dialog modal, `max-w-3xl`. Backdrop and Esc dismiss are intentionally disabled — the wizard accumulates server-side state (agent row, subagent row, dataset attachments) across steps, so accidental dismissal is worse than the small UX cost of forcing the explicit Cancel button.

## The 6 steps

### 1. Pick a template
Top-of-step welcome: *"An AI agent for your legal team — pick a starting point or build from scratch."*

5 templates total; 4 legal + 1 de-emphasized "Blank":

| id | Title | Suggested specialist | Suggested MCPs | knowledgeRequired |
|---|---|---|---|---|
| `contract-drafter` | Contract Drafter | `clause-writer` | `legifrance` | false |
| `jurisprudence-researcher` | Jurisprudence Researcher | `case-law-searcher` | `legifrance` | false |
| `compliance-advisor` | Compliance Advisor | `compliance-checker` | `legifrance`, `convention-collective` | false |
| `legal-qa` | Legal Q&A on your documents | `document-reader` | (none) | **true** |
| `blank` | Blank | `custom` | (none) | false |

Selecting a template prefills name, description, system prompt, the suggested specialist (step 3), the suggested MCP IDs (step 4), and the knowledge step's mode. User can edit anything downstream.

### 2. Name & personality
Visible: Name (≥3 chars required), Description.
Collapsible "Advanced": System Prompt textarea (prefilled), Model select (default `claude-sonnet-4-6`, list from `/api/models`).

`onBeforeNext`: `POST /api/agents` with `{ name, description, systemPrompt, model: "claude-sonnet-4-6", steps: [], subagents: [] }` and stash `agentId`.

### 3. Specialist (required)
4 specialist cards + "Custom" card. Recommended one preselected from the template.
Below: editable specialist name input (prefilled). Collapsible "Edit prompt" textarea.

`canProceed`: a specialist selected AND `specialistName.length >= 3`.
`onBeforeNext`: stash locally; **no API call yet** (MCPs need to be on the same subagent-create call).

### 4. MCP tools (optional)
Header: *"Connect tools to your **{specialistName}**"*.
Lists from `GET /api/mcps/available` (new endpoint — merges static `lib/mcps/config.json` legal MCPs + user-DB MCPs):
- Legal built-ins: Légifrance, Conventions Collectives — preselected per template's `suggestedMcpIds`
- User MCPs (any added before)
- "+ Add custom MCP server" inline form → `POST /api/mcps`

`onBeforeNext`: `POST /api/agents/[id]/subagents` with `{ name, systemPrompt, model, mcpIds }`. Stash `specialistSubagentId`.

### 5. Knowledge (optional, sometimes required)
Tabs: **Skip** / **Pick existing** / **Upload new**.
- **Skip**: disabled if `knowledgeRequired === true` for the chosen template (only `legal-qa`).
- **Pick existing**: lists `GET /api/datasets`; multi-select; `processed` and `processing` selectable; `error` disabled.
- **Upload new**: dataset name input (template-prefilled), multi-file picker, "Start upload" → `POST /api/datasets` then `POST /api/datasets/[id]/entries`. After upload completes, copy reads *"Uploaded — processing in background. You can move on."*

`onBeforeNext`: for each selected/uploaded dataset, `POST /api/datasets/[id]/attach` with `{ agentId }`. Server-side auto-creates the corpus subagent (deduped). Tracks `attachedDatasetIds` so re-pressing Next after Back doesn't double-fire.

### 6. Done
Summary card: agent name + model badge, specialist name + tools count, documents count.
Live status row (5s poll of `GET /api/datasets/[id]/status`) shown only if any uploaded dataset is still processing.
Primary CTA: **Start chatting** → `/agents/[id]/chat`.
Secondary: *Open advanced settings* → `/agents/[id]`.

`onBeforeNext` for Finish: navigates, closes wizard, sets `lds-chatbot:start-wizard-seen`.

## API constraints honored

- Agent update is **PUT not PATCH** on `/api/agents/[id]`; we instead use the dedicated `POST /api/agents/[id]/subagents` for the incremental specialist-add.
- `/api/agents/[id]/subagents` requires `mcpIds` at creation time (no endpoint to add MCPs to an existing subagent), which is why steps 3 + 4 collect locally and commit together at end of step 4.
- Default `model` server-side is `gpt-4.1-mini`; wizard explicitly passes `claude-sonnet-4-6`.
- Dataset upload is synchronous (blocks until cluster receives the file); cluster-side processing (OCR/chunking/embeddings) is async — wizard waits only for the HTTP upload, then advances.
- New endpoint `GET /api/datasets/[id]/status` aggregates entry statuses since none existed.

## Files

### Created (new)
- `app/api/datasets/[id]/status/route.ts` — entry-status aggregation
- `app/api/mcps/available/route.ts` — merged legal-builtin + user MCP listing
- `lib/mcps/config.json` — static MCP registry with the two legal MCPs (file did not exist before despite stale CLAUDE.md mention)
- `lib/utils/wizard-styling.ts` — two helper functions ported from web-app
- `components/ui/wizard.tsx`, `components/ui/step.tsx`, `components/ui/wizard-steps.tsx` — primitives ported from web-app
- `components/wizards/agents/start/templates.ts` — 5 agent templates + 5 specialist templates + `DEFAULT_AGENT_MODEL`
- `components/wizards/agents/start/state.ts` — `WizardState` type
- `components/wizards/agents/start/wizard-context.tsx` — `WizardStartProvider`, `useWizardStart()`, `<AutoOpenIfEmpty>`
- `components/wizards/agents/start/index.tsx` — main wizard composition (orchestrator owns all `canProceed` and `onBeforeNext` closures; composes `<Step>` directly)
- `components/wizards/agents/start/steps/{template,identity,specialist,mcp,knowledge,done}.tsx` — content-only step components (no `<Step>` wrap; UI + form state only)

### Modified
- `app/(app)/layout.tsx` — wraps children in `<WizardStartProvider>`
- `app/(app)/agents/page.tsx` — renders `<AutoOpenIfEmpty agentCount={...}>`
- `components/app-sidebar.tsx` — Start CTA above nav
- `lib/mcps/index.ts` — `loadEnabledMcpConfigs()` now merges static `lib/mcps/config.json` entries with the user-DB `mcps` table; previously it only read from the DB, which caused `buildAgentWorkflow` to throw `Unknown MCP ID: legifrance` whenever a built-in MCP was attached to a subagent.

### Local config (not committed; .env is gitignored)
- `.env` needs `AUTHENTIK_BASE_URL=https://auth.alien.club` (unprefixed). The pre-existing local `.env` only had the `NEXT_PUBLIC_` form, which `lib/auth.ts` deliberately does not read. `.env.example` already documents the right name.

## Deliberately NOT in scope

- Multi-specialist UX (only one specialist via wizard; users add more from the existing `/agents/[id]` edit page)
- Agent prompt `steps[]` editor (advanced page)
- Custom-MCP "type" selector (we hardcode `streamable_http`, matching what `app/api/mcps/route.ts` already defaults to)
- Drag-and-drop file upload (click-to-pick is sufficient; no fancy DnD library)
- Draft-resume across sessions
- Analytics/dropoff tracking

## QA

Three rounds of Playwright QA (Authentik OAuth login, then full wizard walkthrough).

- **Round 1** — found 14 bugs, 2 P0 / 7 P1 / 3 P2 / 2 P3. All stemmed from one structural mistake: each step wrapper (`<IdentityStep state={...} />`) embedded the `<Step canProceed={...} onBeforeNext={...}>` *inside* its render output. The `<Wizard>` primitive reads those props from its direct children, so it never saw them — leading to no validation, no API calls, and "Start chatting" advancing to an empty step 7 instead of finishing.
- **Refactor** — moved all `canProceed` / `onBeforeNext` closures up into `index.tsx` (the orchestrator) and composed `<Step>` elements directly inside `<Wizard>`. Step files are now pure content components. Same fix also addressed the smaller bugs (missing key prop, missing dialog description, "0 documents" badge, conditional advanced-settings link, knowledge-required default tab).
- **Round 2** — all 14 round-1 bugs verified fixed; one new P0 surfaced: `POST /api/agents/[id]/subagents` returned 500 when built-in MCPs were attached.
- **Diagnosis** — `loadEnabledMcpConfigs()` only read the DB `mcps` table, not the static `config.json`, so `buildAgentWorkflow` couldn't resolve `legifrance` / `convention-collective` and threw.
- **Fix** — `lib/mcps/index.ts` now merges static + DB sources.
- **Round 3** — happy path verified end-to-end: pick "Compliance Advisor", accept all preselected defaults, click through six steps. `POST /api/agents` 201, `POST /api/agents/[id]/subagents` 201 with both legal MCPs in `mcpIds`, summary correct, navigation lands on `/agents/{id}/chat`. Edit page confirms both MCPs are persisted on the specialist row.

### Test checklist (any path)

**Discoverability**
- Sidebar Start button is visible at top, primary-styled
- Auto-open fires once on `/agents` when `agentList.length === 0` and the localStorage flag is unset

**Happy path — Compliance Advisor template**
1. Step 1: Compliance Advisor card selected; Next enabled
2. Step 2: Name prefilled, editable; Advanced collapsible reveals model `claude-sonnet-4-6`; Next fires `POST /api/agents` (201)
3. Step 3: Compliance Checker preselected; specialist name editable; Next stashes locally
4. Step 4: Both Légifrance and Conventions Collectives preselected; Next fires `POST /api/agents/[id]/subagents` (201)
5. Step 5: Skip tab enabled; Next is no-op
6. Step 6: summary correct; Start chatting → `/agents/[id]/chat`

**Validation**
- Step 1 Next disabled until template selected
- Step 2 Next disabled until name length ≥ 3

**Knowledge-required template**
- Pick `legal-qa` template; reach step 5; Skip tab is disabled

**Back navigation**
- After step 2 commit, Back to step 1 doesn't crash. Going forward again from step 2 does NOT re-POST (early-out on `state.agentId !== null`).

**Ghost-agent cleanup**
- If the user closes the wizard mid-flow after step 2 has fired `POST /api/agents`, the orchestrator's `useEffect` unmount cleanup fires `DELETE /api/agents/[id]` so the half-built agent is removed. A `completedRef` short-circuits the cleanup on successful Finish so the real agent is preserved.

**Cancel**
- Clicking the wizard's Cancel button closes the dialog cleanly, no console errors

## Future enhancements (deferred)

- Multi-specialist support inside the wizard ("+ Add another specialist" link)
- Drag-and-drop upload zone
- Draft persistence to localStorage
- Step-level analytics for dropoff visibility
- Cleanup also drops the platform-side workflow on ghost-delete — currently `DELETE /api/agents/[id]` only removes the local DB row (cascading subagents/conversations), leaving an orphan workflow on the platform backend
