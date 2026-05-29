# LDS Chatbot — Corrections & Additional Details

Post-review findings that update earlier plan documents.

---

## Detail 1: Input Injection Mechanism

**Affects**: 02-openai-api-wrapper.md, 03-agent-management.md

The workflow `run` and `run-sync` endpoints accept an `input` object that is injected into the node where `data.isInput === true`.

### How it works

```
POST /workflows/{id}/run-sync
Body: { input: { user_prompt: "hello", session_id: "abc" } }
```

The backend calls `injectInputIntoWorkflowNodes(nodes, input)` (`lib/utils/workflows.ts:14`) which:
1. Maps over the **outer** `nodes` array (NOT nested inner nodes)
2. Finds the node where `node.data.isInput === true`
3. For each key/value in `input`, wraps it as `{ value, isExpression: false, isAttachedToInputNode: false }`
4. Merges over the node's existing `data.params`

### Where input lands: `httpRequest-0`

The `httpRequest-0` outer node has `"isInput": true` (confirmed at `node.json:143`). This is the injection target.

The inner `agentInput-3` also has `isInput: true`, but it's nested inside `aiAgent-1.data.workflow.nodes` — it's never in the outer array that the function iterates.

### Data flow

```
1. POST body { input: { user_prompt, session_id } }
      ↓ injectInputIntoWorkflowNodes
2. httpRequest-0.data.params.user_prompt = "hello"  (isInput: true)
      ↓ httpRequest-0 executes, produces output
3. Edge: httpRequest-0 → aiAgent-1
      ↓ aiAgent dissolves, edge stitches to agentInput-3
4. agentInput-3 receives httpRequest's output
      ↓ passthrough
5. deepAgent-4 reads via expressions:
   - session_id: @agentInput-3.session_id
   - user_prompt: @agentInput-3.user_prompt
```

### Impact on our graph template

The `httpRequest-0` node MUST have:
- `"isInput": true` — makes it the injection target
- An `input` schema defining the accepted fields (`user_prompt`, `session_id`)
- Default param values that get overwritten at runtime by the injected input

---

## Correction 2: Workflow Update Endpoint EXISTS

**Affects**: 03-agent-management.md, 06-implementation-phases.md

There IS a `PATCH /workflows/:workflow_id` endpoint:

```
PATCH /workflows/{workflow_id}
Body: {
  name?: string,
  slug?: string,
  description?: string,
  nodes?: any,
  edges?: any,
  isPublic?: boolean,
  type?: "streaming" | "preset" | ...,
  presetCategory?: string,
  collectionId?: number,
  datasetId?: number,
  tagIds?: number[]
}
```

All fields are optional. Only provided fields overwrite the stored value.

**Impact on agent management**:
- When editing an agent, we PATCH the workflow's `nodes` and `edges` in place
- No need to create new workflows on each edit
- The `workflow_id` stays stable throughout the agent's lifetime
- Much cleaner than the create-new-and-update-pointer approach

Updated flow:
1. **Create**: `POST /workflows` → get `workflow_id`, store locally
2. **Update**: `PATCH /workflows/{workflow_id}` with updated `nodes`/`edges`
3. **Delete**: local-only (or `DELETE /workflows/{id}` if it exists)

---

## Correction 3: AI Models — Dynamic from API

**Affects**: 03-agent-management.md (model selector), 01-overview-architecture.md (tech stack)

Models are NOT hardcoded. They come from `GET /ai-models?select=public&modelType=llm`:

### API Response Shape

```typescript
interface PublicAIModel {
  id: number
  name: string            // "GPT-4o Mini"
  slug: string            // "gpt-4o-mini" — this is what gets stored as the param value
  description: string
  version: string
  modelType: string       // "llm" | "embedding" | "reranker" | "tts" | ...
  pricingType: string
  pricePerInputToken: number
  pricePerOutputToken: number
  provider: {
    id: number
    slug: string          // "openai" | "mistral" | "anthropic"
    name: string          // "OpenAI" | "Mistral" | "Anthropic"
  }
  tags: Tag[]
}
```

### Frontend Component Pattern

Group by `model.provider.slug`, sort alphabetically. Each provider is a `<SelectGroup>` with `<SelectLabel>`, each model is a `<SelectItem value={model.slug}>`.

We'll create a similar component for our app that calls the same API endpoint with the user's auth token.

---

## Correction 4: Theme — Tailwind v4, No JS Config

**Affects**: 01-overview-architecture.md (tech stack), 06-implementation-phases.md (Phase 0)

The project uses **Tailwind CSS v4** which is entirely CSS-driven — no `tailwind.config.ts`.

### Key Files to Copy

1. `styles/globals.css` — CSS variables for `:root` and `.dark`, base styles
2. `styles/tailwind-theme.css` — `@theme inline` block mapping Tailwind utilities to CSS variables, custom color scales (teal, neutral, stone, etc.)

### shadcn/ui Config

```json
{
  "style": "new-york",
  "tailwind": {
    "baseColor": "neutral",
    "css": "styles/globals.css",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rsc": true,
  "tsx": true
}
```

### Brand Identity

- **Primary (dark mode)**: Teal `hsl(183, 39%, 35%)` — the Alien brand color
- **Background (dark)**: Near-black `hsl(0, 0%, 7%)`
- **Foreground (dark)**: White `hsl(0, 0%, 100%)`
- **Sidebar (dark)**: Dark teal accent `hsl(184, 38%, 15%)`
- **Dark mode by default**: `className="dark"` on `<html>`, `next-themes` with `defaultTheme="dark"`

### Font Stack

CSS variables define `Inter, ui-sans-serif, sans-serif` as `--font-sans`. The actual loaded fonts are Geist Sans/Mono via `next/font/google` but they're not wired into the Tailwind theme (a known mismatch in the existing app). For the chatbot we'll use the same setup.

### Init Approach (Updated)

Instead of `npx create-next-app` defaults, we need:
1. Tailwind v4 (not v3) — `npm install tailwindcss@^4`
2. Copy `globals.css` and `tailwind-theme.css` from the main app
3. Copy `components.json` and adjust alias paths
4. Install `tw-animate-css` for animations
5. Skip `tailwind.config.ts` entirely — Tailwind v4 is CSS-only

---

## Detail 5: Streaming Verified (Live Test)

Tested against workflow 47 on localhost:3333. Streaming is working.

### SSE Event Structure

Each SSE event is `data: {json}\n\n` with shape:
```json
{
  "type": "init" | "update" | "done",
  "status": "pending" | "running" | "completed" | "failed",
  "result": {
    "stream": {
      "agent": {
        "chunks": [ /* OpenAI chat.completion.chunk objects */ ],
        "status": "streaming" | "complete",
        "agents": ["MAIN", "subagent-name", ...]
      }
    },
    "results": {
      "<outputNodeId>": [{
        "results": {
          "data": {
            "answer": {
              "content": "...",
              "metadata": { "total_cost", "total_input_tokens", "total_output_tokens", ... },
              "session_id": "uuid"
            },
            "session_id": "uuid"
          }
        }
      }]
    }
  }
}
```

### Chunk Format (Verified)

Each chunk in `stream.agent.chunks[]`:
```json
{
  "id": "agent-d93fc04df89b",
  "model": "ChatMistralAI",
  "object": "chat.completion.chunk",
  "created": 1777023570,
  "agent_context": "MAIN",
  "choices": [{
    "index": 0,
    "delta": { "content": "token text" },
    "finish_reason": null
  }]
}
```

Special chunks:
- First: `delta: { "role": "assistant", "content": "" }` — role announcement
- Last: `delta: {}, finish_reason: "stop"` — turn complete
- Tool calls: `delta: { "tool_calls": [...] }, finish_reason: "tool_calls"`

### Result Path

Final content is at: `result.results["<outputNodeId>"][0].results.data.answer`
- `.content` — the text response
- `.session_id` — for multi-turn continuation
- `.metadata` — execution stats (cost, tokens, time, llm_calls breakdown)

The output node ID varies per workflow (e.g., `httpResponse-9` for workflow 47). In our template we'll use a fixed `httpResponse-2`.

### Streaming Bridge Strategy for OpenAI Wrapper

1. `POST /workflows/{id}/run` → get `job.id`
2. Connect to `GET /jobs/{id}/stream` (SSE)
3. On each event, diff `stream.agent.chunks[]` length vs last seen
4. Forward new chunks directly to client — they're already OpenAI format
5. On `done` event, extract `session_id` and `metadata` from `result.results`

No transformation needed for the chunks — just strip `agent_context` if strict OpenAI compliance is needed, or keep it as a non-standard extension.

---

## Detail 6: Default Model

Default model for new agents: `mistral-small-latest` (Mistral Small). The model selector fetches all available LLM models from the API but pre-selects Mistral Small.

---

## Summary of Changes to Previous Docs

| Document | Change |
|----------|--------|
| 01-overview | Tech stack: Tailwind v4 (no JS config), models from API not hardcoded, default model Mistral Small |
| 02-wrapper | Input goes to `httpRequest-0` (`isInput: true`), flows through dissolved aiAgent to agentInput to deepAgent |
| 03-agent | PATCH endpoint exists for updates, models from `GET /ai-models`, `httpRequest-0` must have `isInput: true` |
| 06-phases | Phase 0: Tailwind v4 setup, copy theme CSS. Phase 2: use PATCH for updates, add model API call |
