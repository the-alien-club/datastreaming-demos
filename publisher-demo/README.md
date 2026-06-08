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
| Visual demo (5 panels, scripted run, design parity) | ✅ wired |
| Backend route surface (`/api/demo/*`) | ✅ wired |
| `GET /api/demo/config` — real proxy with admin OAT | ✅ wired |
| `PUT /api/demo/config` — real proxy with admin OAT | ✅ wired |
| `GET /api/demo/pricing` — resolves real dataset + endpoint prices | ✅ wired |
| Mode B chat — Claude SDK against mcp-alien | ✅ wired (server-side); UI swap pending |
| Mode A chat — Vercel AI SDK → platform Responses SSE | ⏳ stub; full port pending |
| Cross-panel event bus driving real tool calls | ⏳ scripted runner in place |
| Helm chart + ArgoCD application | ✅ wired |

The demo page (`/`) currently uses the scripted runner from the design bundle.
Switching it to drive Mode A/B from the live API requires:

1. Replacing `DemoApp.runAgent` with calls to `/api/demo/chat`.
2. For Mode B: a polling hook against `/api/demo/status/[jobId]`.
3. For Mode A: porting `responses_stream.ts` from `alien-agents/lib/platform/`,
   stripping Prisma/session-persistence references.
4. Resolving `dataset_ids` / `connector_id` from tool args (royalty extraction)
   and feeding the demo event bus.

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
