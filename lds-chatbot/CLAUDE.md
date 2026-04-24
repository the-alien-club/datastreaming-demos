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
| Local DB | SQLite + Drizzle ORM (file: `sqlite.db`) |
| Platform | Alien Backend (AdonisJS) — workflow engine |
| Data Layer | Alien Data Cluster via `@alien/data-api-client` |

---

## How We Use the Alien Platform

The Alien Backend has a **workflow engine**: you can create, update, and run workflows that are directed graphs of nodes (HTTP request, AI agent, MCP server, etc.). The chatbot delegates all actual AI execution to this engine — it never calls an LLM directly.

### Platform API client (`lib/platform/client.ts`)

Four operations:

```ts
createWorkflow(body, token)        // POST /workflows
updateWorkflow(id, body, token)    // PATCH /workflows/:id
runWorkflow(workflowId, input, token) // POST /workflows/:id/run → { id: jobId }
getAiModels(token)                 // GET /ai-models?select=public&modelType=llm
```

All requests carry the user's Authentik OAuth token in `x-oauth-access-token`. The chatbot is a thin client — it constructs the workflow graph locally and persists execution state in SQLite; the platform does the heavy lifting.

### Streaming job results (`lib/platform/sse.ts`)

After `runWorkflow` returns a job ID, we open an SSE connection to `GET /workflows/jobs/:id/sse`. The platform streams events; each event carries the cumulative `result.stream.agent.chunks` array (standard OpenAI chunk objects). We diff successive events (tracking `lastChunkIndex`) to forward only new deltas.

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

## OpenAI-Compatible API

Every agent is exposed at:

```
POST /api/v1/agent/:agentId/v1/chat/completions
```

This is a **drop-in OpenAI replacement**. Accepts standard OpenAI request format:

```json
{
  "messages": [{ "role": "user", "content": "What does this paper say?" }],
  "model": "agent",
  "stream": true
}
```

Returns standard OpenAI SSE chunks (streaming) or a `chat.completion` object (non-streaming), including `usage.prompt_tokens` / `completion_tokens` extracted from platform metadata.

Auth: `Authorization: Bearer <platform-token>` or falls back to session-based Authentik token.

This lets clients plug their existing tooling (LangChain, OpenWebUI, custom scripts) directly into the demo agent without any code changes on their side.

---

## Internal Chat Endpoint

```
POST /api/chat
```

Used by the frontend's `useChat` hook (Vercel AI SDK v6). Wraps the same underlying workflow execution but uses the `createUIMessageStream` / `createUIMessageStreamResponse` format, which supports typed data chunks (`data-conversationId`) for client-side routing.

Flow:
1. Auth check → resolve Authentik access token
2. Load agent → load or create conversation in SQLite
3. Save user message to DB
4. `runWorkflow(agent.workflowId, { user_prompt, session_id }, token)` → job ID
5. Stream SSE from `streamJobSSE`, forward `text-delta` events
6. On completion: persist assistant message, update `conversation.sessionId` for next turn

The `session_id` is the platform's multi-turn memory handle — stored in the `conversations` table and threaded through on every subsequent turn for the same conversation.

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

All state is in a local SQLite file (`sqlite.db`). Drizzle ORM with file-based migrations.

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
| `lib/platform/client.ts` | Platform API client — create/update/run workflow, get models |
| `lib/platform/sse.ts` | SSE streaming generator for job results |
| `lib/db/schema.ts` | Drizzle table definitions |
| `lib/auth.ts` | better-auth session config |
| `lib/auth-helpers.ts` | Access token resolution |
| `lib/mcps/config.json` | Static MCP server registry |
| `app/api/chat/route.ts` | Internal chat endpoint (Vercel AI SDK streaming) |
| `app/api/v1/agent/[id]/v1/chat/completions/route.ts` | OpenAI-compatible external API |
| `app/api/datasets/` | Dataset CRUD and upload proxy routes |
| `app/api/agents/` | Agent CRUD — creates/updates platform workflow on every save |
