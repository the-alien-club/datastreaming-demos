# Publisher Demo

Live, single-page demo of the Alien platform for publishers. Five panels driven
by one MCP Configuration row — Datasources, External APIs, Access Mode, Live
access, and the Agent.

## Quickstart

```bash
cp .env.example .env
# Fill in PLATFORM_API_URL, MCP_ALIEN_URL, ADMIN_OAT, DEMO_CONFIG_SLUG,
# DEMO_WORKFLOW_ID, ANTHROPIC_API_KEY
npm install
npm run dev
```

Visit <http://localhost:3000>.

## Architecture

- **Frontend** — Next.js 16 + React 19 + Tailwind 4. The Alien Intelligence
  design system is imported verbatim from the design bundle (see
  `app/_ds/`).
- **Backend routes** — App Router handlers under `app/api/demo/*`:
  - `GET /api/demo/config` — proxy to `/mcp-configurations/${DEMO_CONFIG_SLUG}`
  - `PUT /api/demo/config` — same path, updates the JSONB config
  - `GET /api/demo/pricing` — resolves a `{ toolName | dataset:id : € }` map
  - `POST /api/demo/chat` — starts a Mode B job or returns 501 for Mode A
  - `GET /api/demo/status/[jobId]` — polling endpoint for Mode B
  - `POST /api/demo/stop/[jobId]` — cancel an in-flight Mode B job
- **Mode B (Data flow, default)** — Claude Agent SDK against
  `${MCP_ALIEN_URL}/mcp?config=${DEMO_CONFIG_SLUG}` with the admin OAT injected
  as `Authorization: Bearer`. Driven asynchronously via `lib/claude-sdk/`.
- **Mode A (Agentic flow)** — Streaming via the platform's Responses API at
  `${PLATFORM_API_URL}/agent/${DEMO_WORKFLOW_ID}/responses`. The full SSE
  translator port is pending (see `app/api/demo/chat/route.ts`); the demo's
  scripted runner handles Agentic flow visually in the meantime.

## What's wired vs not

| Capability | Status |
|---|---|
| Visual demo (5 panels, pixel-matched to design) | ✅ wired |
| Backend route surface (`/api/demo/*`) | ✅ wired |
| `GET /api/demo/config` — real proxy with admin OAT | ✅ wired |
| `PUT /api/demo/config` — real proxy with admin OAT | ✅ wired |
| `GET /api/demo/pricing` — resolves real dataset + endpoint prices | ✅ wired |
| Mode A chat — Vercel AI SDK → platform Responses SSE | ✅ wired |
| Mode B chat — Claude Agent SDK against mcp-alien | ✅ wired |
| `DemoApp.runAgent` drives both modes against the live API | ✅ wired |
| Cross-panel ripple from real tool calls (royalty extraction) | ✅ wired |
| Scripted fallback when env is absent or backend unreachable | ✅ wired |
| Helm chart + ArgoCD application | ✅ wired |

### Runtime behavior

When the page loads, `runAgent(query)` dispatches a real `POST /api/demo/chat`:

- **Mode A (Agentic flow)** — `{ mode: "agentic" }`. The route forwards the
  turn to `POST ${PLATFORM_API_URL}/agent/${DEMO_WORKFLOW_ID}/responses` via
  AI SDK `streamText` against the `@ai-sdk/openai` provider pointed at the
  platform. UI message chunks (`text-delta`, `data-toolCall`, `data-subagent`,
  `finish`) come back as SSE and the client decodes each chunk:
  - `text-delta` → accumulates into the assistant bubble
  - `data-toolCall` → resolved into a `ScriptedTool` shape and dispatched
    through the existing `fireEvent` ripple (panel pulses, tape row, royalty
    tick, attribution bump)
  - `data-subagent` → drives the rail timeline (`planner → specialist`)
  - `finish` → closes the bubble, advances timeline to `critic` then DONE
- **Mode B (Data flow)** — `{ mode: "data" }`. Returns `{ jobId }`. The client
  polls `GET /api/demo/status/[jobId]` every 1.5s, fires the ripple on each
  new `ToolActivity`, and appends `assistant-text` / `complete` messages.
- **Cancel** — switching mode or calling `reset` flips `cancelRef`; Mode B
  fires `POST /api/demo/stop/[jobId]` so the server-side iterator halts.
- **Graceful fallback** — if `POST /api/demo/chat` returns ≥400 (e.g. 503 from
  missing env), `runAgent` catches and falls back to the deterministic
  `buildRun()` scripted run from the design bundle. The demo never breaks
  offline.

### Royalty extraction

`lib/tool-resolver.ts` maps `(toolName, args)` to a `ScriptedTool`:

- **Kind** — datasets when the name starts with `datacluster_`; APIs when it
  starts with `crossref_`, `semantic_scholar_`, `s2_`, `orcid_`, or `crm_`.
- **Source row** — datasets resolve from `args.datasets[0]` (substring match)
  or `args.id` prefix (`bx-` → bioRxiv/Neuroscience, etc.). APIs from the
  tool name prefix.
- **Royalty (€)** — `lib/pricing.ts` exposes `usePricing()` which fetches
  `/api/demo/pricing` once on mount. `computeRoyalty()` sums the per-call
  price plus per-dataset prices for each `dataset_ids` entry. Falls back to
  `€0.005` per dataset hit, `€0.001` per API call when pricing isn't loaded.

## Deployment

```bash
docker build -t publisher-demo:0.1.0 .
helm lint helm/publisher-demo-chart
helm template publisher-demo helm/publisher-demo-chart -f helm/publisher-demo-chart/values.yaml
```

The `helm/argocd-application.yaml` targets the `publisher-demo` namespace.
Secrets (`ADMIN_OAT`, `ANTHROPIC_API_KEY`) are sourced via ExternalSecret
from Vault at `secret/data/publisher-demo` — matching the alien-agents
pattern.

## Layout

```
publisher-demo/
├── app/
│   ├── _ds/                  # Alien Intelligence design system (CSS only)
│   ├── api/demo/             # Backend routes
│   ├── globals.css           # DS imports + demo styles from Alien Demo.html
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── demo-app.tsx          # Orchestrator (scripted runner today)
│   ├── icons.tsx             # Lucide-style stroke icons
│   ├── widgets.tsx           # RollingText, BumpNum, Sparkline, InfoTip, Button
│   └── panels/
│       ├── datasources.tsx
│       ├── external-apis.tsx
│       ├── access-mode.tsx
│       ├── observability.tsx
│       └── agent.tsx
├── lib/
│   ├── env.ts                # Zod-validated env (lazy at request time)
│   ├── seed-data.ts          # Datasources / APIs / messages / buildRun
│   ├── platform/admin-fetch.ts
│   └── claude-sdk/
│       ├── agent-query.ts    # Mode B: Claude SDK + mcp-alien
│       ├── job-store.ts      # In-memory async jobs
│       └── system-prompt.ts
├── helm/                     # Chart + ArgoCD Application
└── Dockerfile
```
