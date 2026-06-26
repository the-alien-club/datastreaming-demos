# Alien Agents API — reference for create-agent skill

Endpoint contracts the skill depends on. Source of truth: route handlers + Zod schemas in `models/*/types.ts`.

All endpoints require a better-auth session cookie. No bearer-token path.

## Endpoints used

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/agents` | Catalog: existing agents (own + public). |
| `GET` | `/api/specialists` | Catalog: reusable subagent templates. |
| `GET` | `/api/datasets` | Catalog: available corpora. |
| `GET` | `/api/mcps` | Catalog: MCPs available to the user. |
| `POST` | `/api/mcps` | Create a new MCP entry. |
| `POST` | `/api/datasets` | Create a new (empty) dataset row. File upload is a separate, deferred-to-UI step. |
| `POST` | `/api/agents` | Create the agent. Subagents are inline in the body. |
| `POST` | `/api/datasets/:id/attach` | Attach an existing dataset to a freshly-created agent. Auto-generates a corpus subagent. |

## Error handling

| Status | Meaning | Skill action |
|---|---|---|
| 401 | Cookie missing / expired | Re-resolve cookie (Step 1). |
| 400 | Zod validation failed | Surface body verbatim — it names the failing field path. Offer fix-and-retry. |
| 5xx | Platform / app failure | Surface status + body. Stop. |

## Catalog read shapes (Step 2)

### `GET /api/agents` → `AgentListResponse`

Array of agents (own + public). Each item:

```ts
{
  id: string
  name: string
  description: string | null
  model: string | null
  isOwn: boolean
  subagents: Array<{ name: string; mcpIds: string | null; datasetId: string | null }>
  // ... other fields, see review-agent/API.md for the full shape
}
```

For the catalog tables, only `name`, `subagents.length`, `model`, `isOwn` are needed.

### `GET /api/specialists` → `SpecialistListResponse`

```ts
Array<{
  id: string
  userId: string
  name: string
  description: string | null
  systemPrompt: string          // up to 64 000 chars
  model: string | null
  mcpIds: string | null         // JSON-encoded string of string[]
  isPublic: boolean
  isForkable: boolean
  isOwn?: boolean
}>
```

When inlining a specialist into the new agent's subagents, copy: `name`, `description`, `systemPrompt`, `model`, `JSON.parse(mcpIds)`.

### `GET /api/datasets` → `DatasetListResponse`

```ts
Array<{
  id: string
  clusterDatasetId: number | null
  name: string
  description: string | null
  status: "pending" | "processing" | "ready" | "error" | null
  isPublic: boolean
  attachedAgentCount: number
  isOwn: boolean
}>
```

Skip attaching anything whose `status !== "ready"` — the corpus subagent will return empty results until processed.

### `GET /api/mcps` → `McpListResponse`

```ts
Array<{
  id: string
  name: string
  serverUrl: string
  transport: "streamable_http" | "sse" | "stdio" | null // only "streamable_http" is supported by the platform's MCP node; sse/stdio fail at runtime
  description: string | null
  categories: string[]
  type: string | null
  provider: string | null
  isPublic: boolean
}>
```

The built-in id `"datacluster"` may not be in this list — it's wired by convention. Corpus subagents use `mcpIds: ["datacluster"]` regardless.

## Write shapes (Step 8)

### `POST /api/mcps` — `CreateMcpBody`

```ts
{
  name: string                  // min 1, max 120
  serverUrl: string             // must be http(s) URL — no javascript: or data:
  transport?: "streamable_http" | "sse" | "stdio"   // default "streamable_http" — the only supported value; sse/stdio fail at runtime
  authToken?: string | null
  description?: string | null   // max 2000
  categories?: string[]         // each 1-80 chars, max 20 entries
  type?: string | null          // max 40
  provider?: string | null      // max 80
  pricePerQuery?: string | null // max 40 (string — formatted price like "$0.01")
  enabled?: boolean
}
```

Returns the created `Mcp` row including `id`. Capture and rewrite any subagent `mcpIds[]` placeholders.

### `POST /api/datasets` — `CreateDatasetData`

```ts
{
  name: string                  // min 1, max 120
  description?: string          // max 2000
  aiInstructions?: string       // max 8000 — appended to corpus-subagent prompt under "## How to use this corpus"
}
```

Returns the dataset row. `clusterDatasetId` will be null until the cluster sync completes — but for the skill's purposes, the local `id` is what matters for the subsequent attach call.

**File upload is NOT this skill's job.** After POSTing the dataset, surface the UI URL (`${BASE}/datasets/<id>`) and ask the user to upload via the UI.

### `POST /api/agents` — `CreateAgentData`

```ts
{
  name: string                  // min 1, max 120
  description?: string          // max 2000
  systemPrompt: string          // min 1, max 128 000 — REQUIRED
  author?: string | null        // max 120
  steps?: Array<{
    name: string                // min 1, max 120
    prompt: string              // min 1, max 16 000
  }>                            // defaults to [] if omitted
  model?: string                // min 1, max 120 — defaults to "gpt-4.1-mini" server-side
  subagents?: Array<{
    name: string                // min 1, max 120 — slugified into the orchestrator's task() tool name
    description?: string        // max 2000 — shown to the orchestrator at dispatch
    systemPrompt: string        // min 1, max 128 000
    model: string               // min 1, max 120 — REQUIRED on subagents
    mcpIds: string[]            // defaults to []
    datasetId?: string | null   // null for inline / specialist-derived subagents; corpus subagents are auto-generated by /attach
  }>                            // defaults to []
  starterPrompts?: string[]     // each 1-500 chars
}
```

Returns the created agent including `id`, `workflowId`, and `subagents` array.

**Critical:**
- Do NOT include corpus subagents in the initial `subagents[]`. The `POST /api/datasets/:id/attach` endpoint generates them with the correct boilerplate prompt and wiring.
- Inline subagents derived from specialists go in `subagents[]` directly — name, description, systemPrompt, model, mcpIds all copied from the specialist row.
- `subagents[].model` is REQUIRED (unlike on the agent itself). Default to the same value as `agent.model` if the user doesn't specify.

### `POST /api/datasets/:id/attach` — `DatasetAttachData`

```ts
{
  agentId: string               // the id returned by POST /api/agents
}
```

Server-side:
1. Validates ownership of both dataset and agent.
2. Guards against duplicate attachments (returns error if already attached).
3. Builds a corpus subagent with name `"<dataset.name> Corpus"`, the boilerplate system prompt + dataset.aiInstructions, `mcpIds: ["datacluster"]`.
4. PATCHes the workflow graph on the platform.
5. Returns `{ subagentId: string }`.

The newly-attached corpus subagent will appear on subsequent `GET /api/agents/:id` responses.
