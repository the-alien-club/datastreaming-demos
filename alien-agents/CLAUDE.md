# Alien Agents — CLAUDE.md

## What This Is

Alien Agents is the public Alien demo application (formerly the LDS Chatbot FDE demo). It showcases how the Alien platform can be used to build a fully working AI research assistant in days, not months.

Concretely: a Next.js 16 web app where users create AI agents backed by the Alien workflow engine, attach specialist subagents with MCP tool access, upload document datasets for RAG, and chat in a streaming multi-turn interface. Every agent is also exposed as an **OpenAI-compatible API endpoint**, so any existing tool that speaks the OpenAI chat completions format can point at it and just work.

**Audience**: Client stakeholders evaluating the Alien platform. The demo is live and real — it runs real workflows against real data cluster clusters.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16.2.4 (App Router) |
| UI | React 19, TailwindCSS v4, shadcn/ui |
| Auth | better-auth + Authentik OAuth2/OIDC |
| AI SDK | Vercel AI SDK v6 (`ai` + `@ai-sdk/react`) |
| Local DB | Postgres 16 + Prisma ORM (`pg` driver adapter) |
| Platform | Alien Backend (AdonisJS) — workflow engine |
| Data Layer | Alien Data Cluster via `@alien/data-api-client` |

---

## How We Use the Alien Platform

The Alien Backend has a **workflow engine**: you can create, update, and run workflows that are directed graphs of nodes (HTTP request, AI agent, MCP server, etc.). The chatbot delegates all actual AI execution to this engine — it never calls an LLM directly.

### Platform API client (`lib/platform/client.ts`)

Three operations for agent lifecycle (workflow CRUD + AI-model discovery):

```ts
createWorkflow(body, token)        // POST /workflows
updateWorkflow(id, body, token)    // PATCH /workflows/:id
deleteWorkflow(id, token)          // DELETE /workflows/:id
getWorkflow(id, token)             // GET /workflows/:id
getAiModels(token)                 // GET /ai-models?select=public&modelType=llm
```

All requests carry the user's Authentik OAuth token in `x-oauth-access-token`. The chatbot is a thin client — it constructs the workflow graph locally and persists execution state in Postgres; the platform does the heavy lifting.

Chat turns no longer go through `/workflows/:id/run` + the legacy `/jobs/:id/stream` SSE; they go through the platform's OpenAI Responses-API-compatible endpoint at `POST /agent/:workflowId/responses` (see below).

### Streaming chat turns (Responses API)

The `/api/chat` route calls `POST /agent/:workflowId/responses` on the platform with `stream: true` and forwards the resulting OpenAI-Responses-API SSE stream through `lib/platform/responses_stream.ts`, which translates events to AI SDK v6 UI message parts:

- `response.output_text.delta` → `text-delta`
- non-root `response.output_item.added` (item.id encodes agent identity per the spec) → `data-subagent` panel announcement
- `response.function_call_arguments.done` → `data-toolCall`
- `response.created` → captures `response_id` for next-turn `previous_response_id`
- `response.completed` / `response.failed` → captures usage / error

The spec lives in `web-app/packages/backend/lib/streaming/specs/responses_v1.md`.

---

## Workflow Graph Architecture

Every agent is a workflow persisted on the platform backend. We build this graph in `lib/platform/workflows.ts`.

### Outer graph (always fixed)

```
httpRequest-0  →  aiAgent-1  →  httpResponse-2
```

- `httpRequest-0`: accepts `{ user_prompt, session_id }` as input schema
- `aiAgent-1`: container node; its inner graph is the real agent
- `httpResponse-2`: returns the agent's answer and session ID

### Inner graph (built dynamically per agent config)

```
agentInput-3  →  deepAgent-4  →  agentOutput-5
                      |
                 subagent-6  →  mcpServer-7
                 subagent-8  →  mcpServer-9
                              →  mcpServer-10
                 ...
```

- `agentInput-3`: passes `user_prompt` and `session_id` from the HTTP request node
- `deepAgent-4`: the core LLM node. Params: `model`, `system_prompt` (fully assembled), `streaming: true`, `session_id` (for multi-turn memory), `user_prompt`
- `agentOutput-5`: extracts `answer` and `session_id` from deepAgent output
- `subagent-N` (dynamic, starting at index 6): specialist subagents connected to deepAgent via the `agents` handle
- `mcpServer-N` (dynamic): MCP server nodes connected to their parent subagent via the `tools` handle

Dynamic node IDs start at index 6 and increment globally across both subagents and MCP nodes.

### System prompt assembly

```ts
assembleSystemPrompt(overallPrompt, steps)
// → "${overallPrompt}\n\n# Steps\n\n## Step 1: {name}\n{prompt}\n\n## Step 2: ..."
```

Steps are concatenated sections of the overall system prompt sent to `deepAgent-4`. If no steps are defined, the overall prompt is used verbatim.

### Creating and updating workflows

When the user creates an agent in the UI:
1. `buildAgentWorkflow(config, mcpConfigs)` builds the full node/edge graph
2. `createWorkflow(...)` POSTs it to the platform → returns `workflowId`
3. The `workflowId` is saved to the local `agents` table

When the user edits an agent (name, prompt, steps, subagents, MCP tools):
1. Same `buildAgentWorkflow(...)` call, fresh graph
2. `updateWorkflow(id, { nodes, edges, name, ... }, token)` PATCHes the existing workflow
3. The platform swaps in the new graph; ongoing conversations pick it up on the next turn

---

## OpenAI-Compatible APIs

The chatbot itself no longer hosts an OpenAI-compatible API surface — external consumers point directly at the platform backend. Every agent is exposed at:

```
POST https://api.alpha.alien.club/agent/:workflowId/chat/completions
POST https://api.alpha.alien.club/agent/:workflowId/responses
GET  https://api.alpha.alien.club/agent/:workflowId/responses/:respId
```

`chat/completions` is OpenAI Chat Completions stream-conformant (no native resume). `responses` is OpenAI Responses-API stream-conformant with native `sequence_number`-based resume via the GET endpoint. Specs live in `web-app/packages/backend/lib/streaming/specs/`.

Clients plug their existing tooling (OpenAI SDK, LangChain `ChatOpenAI`, AI SDK 5+ `streamText`, etc.) into either endpoint without code changes.

---

## Internal Chat Endpoint

```
POST /api/chat
```

Used by the frontend's `useChat` hook (Vercel AI SDK v6). Forwards the turn to the platform's Responses API endpoint and translates the SSE event stream to AI SDK UI message parts.

Flow:
1. Auth check → resolve Authentik access token
2. Load agent → load or create conversation in Postgres
3. Save user message to DB
4. `POST /agent/:workflowId/responses` on the platform with `stream: true`, `previous_response_id: conversation.sessionId`
5. Translate Responses SSE events through `lib/platform/responses_stream.ts` → AI SDK UI parts
6. On `response.completed`: persist assistant message; persist the new `response_id` as `conversation.sessionId` so the next turn passes it as `previous_response_id`

The `sessionId` column on `conversations` now stores the platform-assigned `response_id` of the latest turn (not the legacy workflow `session_id`); the platform's response store maps `previous_response_id` to the underlying agent runtime session for memory continuity.

---

## Data Cluster Integration

Users can upload document datasets and attach them to agents as a RAG corpus.

### Upload flow (via `@alien/data-api-client`)

The Next.js API routes proxy calls through the Platform Backend (which proxies to the cluster identified by `CLUSTER_ID` env var):

1. `POST /api/datasets` → creates dataset in cluster via `createDatasetApiV1DatasetsPost`; applies the `general_purpose` preset pipeline with `on_upload` trigger
2. `POST /api/datasets/:id/upload` → creates an entry then uploads the file via `uploadFileToEntryApiV1EntriesEntryIdUploadPost`
3. `GET /api/datasets/:id/status` → polls cluster entry status every 10s: `pending → uploading → uploaded → processing → processed`
4. Local `datasets` table tracks `clusterDatasetId` and status

### Corpus subagent

When attaching a dataset to an agent, the UI auto-generates a subagent node whose system prompt instructs it to use the `datacluster` MCP tool with the specific `datasetIds` for RAG queries. The subagent is wired to a `mcpServer` node pointing at `https://mcp.alien.club/datacluster/mcp`.


---

## Local Database Schema (`prisma/schema.prisma`)

All state is in a local Postgres database. Prisma manages the schema and migrations. `docker-compose.yml` brings up a single Postgres 16 container for local dev (port 5435); the Helm chart provisions a per-deployment Postgres StatefulSet for production.

| Table | Purpose |
|---|---|
| `agents` | Agent config: `workflowId` (platform ID), `name`, `systemPrompt`, `steps` (JSON), `model` |
| `agentSubagents` | Subagent nodes per agent: `systemPrompt`, `model`, `mcpIds` (JSON), `datasetId`, `nodeId` |
| `conversations` | Per-agent conversation threads; `sessionId` = platform multi-turn handle |
| `messages` | Full conversation history: `role`, `content`, `metadata` (tokens, cost) |
| `datasets` | Uploaded corpora: `clusterDatasetId`, `status` |
| `mcps` | User-added custom MCP servers |
| `specialists` | Reusable subagent templates (not yet wired to agent creation UI) |

---

## Auth

Better-auth with Authentik as the OAuth2/OIDC provider. The Authentik access token is stored in the session and forwarded to the platform API. For external API calls (OpenAI-compat endpoint), a `Bearer` token in the `Authorization` header is accepted directly.

Environment variables:
```
NEXT_PUBLIC_AUTHENTIK_BASE_URL=https://auth.alien.club
AUTHENTIK_APP_SLUG=datastreaming
AUTHENTIK_CLIENT_ID=...
AUTHENTIK_CLIENT_SECRET=...
PLATFORM_API_URL=http://localhost:3333   # or staging/prod URL
CLUSTER_ID=77                            # data cluster ID on the platform
DATACLUSTER_MCP_URL=                     # optional override for MCP URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Development

```bash
npm install
npm run dev          # Next.js dev server on :3000
npm run db:migrate   # Apply Prisma migrations (prisma migrate deploy)
npm run auth:migrate # Run better-auth migration (first time only)
npm run build
```

Schema changes: edit `prisma/schema.prisma`, then run `npx prisma migrate dev --name <description>` to generate and apply a new migration. Generated client lives in `lib/generated/prisma/`.

---

## Key Files

| Path | Responsibility |
|---|---|
| `lib/platform/workflows.ts` | Workflow graph builder — all node and edge construction |
| `lib/platform/client.ts` | Platform API client — workflow CRUD, AI-model lookup |
| `lib/platform/responses_stream.ts` | OpenAI Responses-API SSE → AI SDK UI message parts translator |
| `lib/db/schema.ts` | Domain enum barrel (re-exports `DATASET_STATUS`, `ENTRY_STATUS`, etc.) |
| `lib/db/index.ts` | Prisma client singleton + shared pg Pool + auth helpers |
| `prisma/schema.prisma` | Canonical database schema |
| `lib/auth.ts` | better-auth session config |
| `lib/auth-helpers.ts` | Access token resolution |
| `app/api/chat/route.ts` | Internal chat endpoint (auth proxy → platform Responses API) |
| `app/api/datasets/` | Dataset CRUD and upload proxy routes |
| `app/api/agents/` | Agent CRUD — creates/updates platform workflow on every save |

---

## Routing Structure

```
/ → redirect to /fr/agents (next.config.ts)

/[locale]/                              → LocaleLayout (html/body, ThemeProvider, Toaster)
  /sign-in                              → OAuth2 sign-in card
  /(app)/                               → AppLayout (sidebar + auth guard + WizardStartProvider)
    /agents                             → Agent list grid
    /agents/new                         → Simple agent creation form
    /agents/[agentId]                   → Agent detail/edit
    /agents/[agentId]/chat              → New conversation with agent
    /agents/[agentId]/chat/[convId]     → Existing conversation
    /conversations                      → All conversations, date-grouped
    /datasets                           → Dataset list + status badges
    /specialists                        → Reusable subagent templates list
    /mcps                               → MCP server CRUD

API routes (no locale prefix):
  POST   /api/chat                      → Streaming chat turn
  POST   /api/chat/resume               → Mid-stream reconnect
  GET/POST /api/agents                  → Agent list + create
  GET/PATCH/DELETE /api/agents/:id      → Agent CRUD
  POST   /api/agents/:id/subagents      → Add subagent to agent
  GET/POST /api/datasets                → Dataset list + create
  POST   /api/datasets/:id/entries      → File upload
  POST   /api/datasets/:id/attach       → Attach dataset to agent
  GET/POST/PUT/DELETE /api/mcps         → MCP server CRUD
  GET    /api/models                    → AI model list from platform
  DELETE /api/conversations/:id         → Delete conversation
  /api/auth/[...all]                    → better-auth OAuth2 handler
```

i18n: French (`fr`) is the default locale with no URL prefix (`as-needed` strategy). English gets `/en/` prefix. All `<Link>` and `useRouter` are imported from `@/i18n/routing`, not `next/navigation`.

---

## UI / Component Architecture

### Design System

- **Component library**: shadcn/ui (Radix UI primitives + CVA for variants)
- **Styling**: TailwindCSS v4 + `cn()` (tailwind-merge) for class composition
- **Icons**: lucide-react
- **Animation**: motion (framer-motion successor)
- **Toasts**: sonner
- **Markdown**: streamdown (streaming) + react-markdown + remark-gfm
- **Theme**: `next-themes`, `defaultTheme="light"`, `enableSystem={false}`
- **Primary color**: `--primary: hsl(218, 100%, 44%)` (Alien blue) in `app/globals.css`

### State Management

No global store. Three tiers:

1. **Server state**: Next.js Server Components query Prisma directly — Agent list, Conversations list, Specialists list.
2. **Client-local**: `useState` + `useEffect` + `apiFetch()` for interactive pages — `datasets-view.tsx`, `mcps-view.tsx`, `new-agent-form.tsx`.
3. **Streaming chat**: Vercel AI SDK `useChat` hook, backed by `POST /api/chat` SSE.
4. **Wizard state**: Single `WizardState` object in `useState` inside `StartWizard`, passed as `state + setState` to each step. Accessible anywhere via `useWizardStart()` context.

### Key UI Components for UX Work

| File | What it renders |
|---|---|
| `app/globals.css` | All CSS variables (colors, spacing, theme) |
| `components/app-sidebar.tsx` | Global navigation sidebar (desktop) + Sheet (mobile) |
| `app/[locale]/(app)/layout.tsx` | Main app shell: sidebar + content area |
| `app/[locale]/(app)/agents/page.tsx` | Agent cards grid |
| `app/[locale]/(app)/conversations/page.tsx` | Conversation history, date-grouped |
| `app/[locale]/(app)/datasets/datasets-view.tsx` | Dataset list with status badges |
| `app/[locale]/(app)/mcps/mcps-view.tsx` | MCP server CRUD with Dialog |
| `components/wizards/agents/start/index.tsx` | 6-step agent creation wizard (Dialog) |
| `components/wizards/agents/start/templates.ts` | Preset agent + specialist templates |
| `components/ui/wizard.tsx` | Generic multi-step Wizard component |
| `components/ui/wizard-steps.tsx` | Step indicator visual |
| `components/chat/` | Chat UI components (messages, input, subagent panels) |

### Wizard (6-step agent creation)

Rendered in a Dialog, opened via `useWizardStart()` → `openWizard()` from anywhere. Auto-opens on first visit (`localStorage` key `lds-chatbot:start-wizard-seen`).

Steps: **Template → Identity → Specialist → MCP → Knowledge → Done**

Each step uses the generic `Wizard` + `Step` components. Steps gate progression with `canProceed()` and call the platform API in `onBeforeNext()`. On cancel mid-wizard, cleanup fires `DELETE /api/agents/:id` to remove the orphaned workflow.

### Role Gating

`isOrgClient` is computed server-side in `(app)/layout.tsx` from `getUserOrgRole()` (calls `GET /users/me` on the platform). Navigation items with `clientVisible: false` are filtered in `app-sidebar.tsx`.

- `org-client`: sees only Agents + Conversations; Chat button only on public agents; no create/edit
- Full users: own agents with Chat, Settings, Publish, Delete; plus Specialists, Datasets, MCP management

### Notable Patterns

**`apiFetch()`** (`lib/api-fetch.ts`): All client-side API calls use this — it prepends `NEXT_PUBLIC_BASE_PATH` so the app works when mounted at a sub-path (e.g. `/agents/`). Never use `fetch()` directly from client components.

**Dual-stream in `/api/chat`**: `ReadableStream.tee()` splits the AI SDK chunk stream — one copy to SSE response, one drained asynchronously by `persistAssistantMessage()`. Persistence failures don't interrupt the live stream.

**Streaming resume**: `SidecarState` emits `data-streamProgress` chunks (transient) with `sequence_number`; the chat client stores these in `localStorage` as resume cursor. `POST /api/chat/resume` accepts `{ conversationId, responseId, startingAfter }`.

**Wizard cleanup**: `StartWizard` registers a `useEffect` cleanup that fires `DELETE /api/agents/:agentId` when the component unmounts without completion, preventing orphaned platform workflows.
