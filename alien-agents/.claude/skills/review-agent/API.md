# Alien Agents API — reference for review-agent skill

Endpoint contracts and payload shapes the skill depends on. Source of truth: the route handlers and Zod schemas in [models/agents/types.ts](../../../../models/agents/types.ts) and [models/datasets/types.ts](../../../../models/datasets/types.ts).

All endpoints require a better-auth session cookie. No bearer-token path.

## Endpoints

| Method | Path | Purpose | Notes |
|---|---|---|---|
| `GET` | `/api/agents` | List own + public agents | Each item has `isOwn`. Filter to owned for the picker. |
| `GET` | `/api/agents/:id` | Owner-view agent payload | Returns public subset for non-owners (insufficient — stop). |
| `GET` | `/api/datasets/:id` | Dataset detail including `aiInstructions` | Owner-only fields. |
| `GET` | `/api/datasets/:id/status` | Per-entry status counts | Use to flag corpora that are attached but not yet processed. |
| `GET` | `/api/mcps` | User-visible MCP catalog | Index by `id` for cross-referencing `subagent.mcpIds[]`. |
| `PUT` | `/api/agents/:id` | **Full-replace** update | Echoes every subagent. Omitting wipes them. |

## Error handling

| Status | Meaning | Skill action |
|---|---|---|
| 401 | Cookie missing / expired | Re-resolve cookie (Step 2 of SKILL.md). |
| 403 | Caller is not the owner | Stop — public payload is insufficient for review. |
| 404 | Bad ID | Ask user to confirm. |
| 400 | Zod validation failed on PUT | Surface response body — it names the failing field path. |
| 409 | `AgentWorkflowNotFoundError` | Surface verbatim. Do not retry. |
| 5xx | Platform / app failure | Surface status + body. Stop. |

## Payload shapes

### `AgentListResponse` (`GET /api/agents`)

```ts
// Array of AgentResponse (same shape as below) plus an isOwn discriminator.
// Server returns all owned agents first (newest first), then all public agents.
Array<AgentResponse & { isOwn: boolean }>
```

The skill filters to `isOwn === true` for the picker. Public agents from other users return a truncated payload from `GET /api/agents/:id` (no `systemPrompt`, no `subagents`), so they're not reviewable.

### `AgentResponse` (owner view of `GET /api/agents/:id`)

```ts
{
  id: string
  userId: string
  workflowId: number | null
  name: string
  description: string | null
  systemPrompt: string | null       // top-level — concatenated with steps for the orchestrator
  steps: string | null              // JSON-encoded string of StepData[]
  starterPrompts: string[]          // ALREADY parsed by the route handler
  model: string | null              // e.g. "gpt-4.1-mini"
  author: string | null
  isPublic: boolean
  isForkable: boolean
  createdAt: string | null
  updatedAt: string | null

  subagents: Array<{
    id: string
    agentId: string
    name: string                    // SLUGIFIED → becomes task() tool name the LLM sees
    systemPrompt: string
    model: string | null
    mcpIds: string | null           // JSON-encoded string of string[]
    datasetId: string | null        // non-null = corpus subagent
    nodeId: string | null           // slugified node id in the workflow graph
    createdAt: string | null
  }>
}
```

### `DatasetDetailResponse` (`GET /api/datasets/:id`)

```ts
{
  id: string
  userId: string
  clusterDatasetId: number | null   // null = not yet synced to data cluster
  name: string
  description: string | null
  aiInstructions: string | null     // free-form, appended to corpus-subagent prompt under "## How to use this corpus"
  status: "pending" | "processing" | "ready" | "error" | null
  isPublic: boolean
  createdAt: string | null
  updatedAt: string | null
  attachedAgents: Array<{ id: string; name: string | null }>
}
```

### `DatasetStatusResponse` (`GET /api/datasets/:id/status`)

```ts
{
  datasetId: string
  totalEntries: number
  byStatus: {
    pending: number
    uploading: number
    uploaded: number
    processing: number
    processed: number
    error: number
  }
  overall: "empty" | "uploading" | "processing" | "processed" | "error"
}
```

### `McpListResponse` (`GET /api/mcps`)

```ts
Array<{
  id: string
  userId: string
  name: string
  serverUrl: string
  transport: "streamable_http" | "sse" | "stdio" | null // only "streamable_http" is supported by the platform's MCP node; sse/stdio fail at runtime
  authToken: string | null
  description: string | null
  categories: string[]
  type: string | null
  provider: string | null
  pricePerQuery: string | null
  enabled: boolean | null
  isPublic: boolean
}>
```

The id `"datacluster"` is the built-in corpus-search MCP. Corpus subagents always reference it via `mcpIds: ["datacluster"]`.

## `PUT /api/agents/:id` body — `UpdateAgentData` schema

Transcribed from `models/agents/types.ts:64-78`. The PUT body **must** validate against this schema or the route returns 400.

```ts
{
  name: string                          // min 1, max 120 chars, trimmed non-empty
  description?: string | null           // max 2000 chars
  author?: string | null                // max 120 chars
  createdAt?: string                    // YYYY-MM-DD, optional — only send when changing
  systemPrompt: string                  // max 128 000 chars
  steps: Array<{
    name: string                        // min 1, max 120
    prompt: string                      // min 1, max 16 000
  }>                                    // REQUIRED — present even if empty
  starterPrompts?: string[]             // each 1-500 chars
  model: string                         // min 1, max 120
  subagents: Array<{
    name: string                        // min 1, max 120
    description?: string                // max 2000
    systemPrompt: string                // min 1, max 128 000
    model: string                       // min 1, max 120
    mcpIds: string[]                    // defaults to []
    datasetId?: string | null           // PRESERVE for corpus subagents
  }>                                    // REQUIRED — present even if empty (omitting wipes subagents)
  isForkable: boolean                   // defaults to false; echo current value if unchanged
}
```

### Critical gotchas

- **`subagents[]` is full-replace.** The platform deletes existing subagent rows and reinserts the array. Echo every subagent — including untouched ones.
- **`steps[]` is full-replace.** Same — echo every step.
- **`datasetId` must be preserved** on corpus subagents. Dropping it orphans the subagent from its dataset and breaks the propagation hook.
- **`subagents[].mcpIds`** here is `string[]` — but the `GET` returns it as a **JSON-encoded string**. Parse it on read; send as array on write.
- **`steps`** on `GET` is also a JSON-encoded string. Parse on read; send as array on write.
- **`starterPrompts`** is already a parsed array on the `GET` response (the route handler parses it). Send as a plain array on write.

## Build the assembled system prompt

The orchestrator's `deepAgent-4` receives this exact string (mirror of `assembleSystemPrompt` from `lib/platform/workflows.ts:310-321`):

```
if steps.length === 0:
  assembled = agent.systemPrompt
else:
  assembled = agent.systemPrompt
            + "\n\n# Steps\n\n"
            + steps.map((s, i) => `## Step ${i+1}: ${s.name}\n${s.prompt}`).join("\n\n")
```

The slugified subagent `name` becomes the `task()` tool name the orchestrator sees. Rubric checks for orphan subagents, dispatch-friendly naming, etc. all depend on this — search the assembled string for each subagent's slugified name (lowercase, accents stripped, non-alphanumeric → `-`, trimmed, max 40 chars).
