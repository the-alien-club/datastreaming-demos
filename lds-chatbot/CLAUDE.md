# LDS Chatbot — CLAUDE.md

## What This Is

The LDS Chatbot is a **FDE (First Data Engine) demo application** for clients. It showcases how the Alien platform can be used to build a fully working AI research assistant in days, not months.

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
| Local DB | Postgres 16 + Drizzle ORM (`pg` driver) |
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

## Local Database Schema (`lib/db/schema.ts`)

All state is in a local Postgres database. Drizzle ORM manages the schema; migrations in `lib/db/migrations/`. `docker-compose.yml` brings up a single Postgres 16 container for local dev (port 5435); the Helm chart provisions a per-deployment Postgres StatefulSet for production.

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
npm run db:migrate   # Apply Drizzle migrations
npm run auth:migrate # Run better-auth migration (first time only)
npm run build
```

Migrations live in `drizzle/` and are generated with `npm run db:generate` after schema changes.

---

## Key Files

| Path | Responsibility |
|---|---|
| `lib/platform/workflows.ts` | Workflow graph builder — all node and edge construction |
| `lib/platform/client.ts` | Platform API client — workflow CRUD, AI-model lookup |
| `lib/platform/responses_stream.ts` | OpenAI Responses-API SSE → AI SDK UI message parts translator |
| `lib/db/schema.ts` | Drizzle table definitions |
| `lib/auth.ts` | better-auth session config |
| `lib/auth-helpers.ts` | Access token resolution |
| `lib/mcps/config.json` | Static MCP server registry |
| `app/api/chat/route.ts` | Internal chat endpoint (auth proxy → platform Responses API) |
| `app/api/datasets/` | Dataset CRUD and upload proxy routes |
| `app/api/agents/` | Agent CRUD — creates/updates platform workflow on every save |
