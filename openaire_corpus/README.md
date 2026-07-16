# OpenAIRE Literature Research

A research workspace for scholarly-literature discovery over the **OpenAIRE**
research graph. Co-branded **Alien Intelligence × OpenAIRE**. Primary language:
**English** (French secondary).

See `CLAUDE.md` for full project orientation, `AGENTS.md` for the Next.js 16 caveat, and `playbook/` for engineering rules.

## Quick start

### 1. Postgres

Local dev reuses the platform Postgres container (`datastreaming-postgres-platform`)
on **:5434**, database `openaire_corpus`. If it is not already running, start it
from the platform `docker-compose`. This app's `docker-compose.yml` deliberately
bundles **no** Postgres — one source of truth for both app and worker.

### 2. Environment

```bash
cp .env.example .env.local
# Edit .env.local:
#   BETTER_AUTH_SECRET   — generate with `openssl rand -hex 32`
#   ANTHROPIC_API_KEY    — your Anthropic key (or set AGENT_PROVIDER=openrouter + OPENROUTER_API_KEY)
#   OPENAIRE_MCP_TOKEN   — request from the Alien platform team
# For a real ingest (CLUSTER_MODE=real) also set WORKER_RUNNER_URL,
# DATACLUSTER_MCP_URL, CLUSTER_BEARER_TOKEN — see .env.example.
```

### 3. Install + migrate + seed

```bash
npm install
npx prisma migrate dev          # applies all migrations
npx prisma db seed              # fake-data seed (offline; default for first-time setup)
```

### 4. Run

```bash
npm run dev                     # http://localhost:3000
```

Visit http://localhost:3000 — redirects to `/en/sign-in`. Sign in with `leo@alien.club` / `dev-local`. Pick a project from the list.

## Running a local ingest

Ingestion is a separate long-running worker (`worker-v2/`). For local testing,
run it on the **host** — that keeps the Postgres (:5434) and terminal-callback
(:3000) routing on plain `localhost`, with no container networking to reason about.

```bash
# 0. App env: CLUSTER_MODE=real, WORKER_RUNNER_URL=http://localhost:7777,
#    WORKER_CALLBACK_BASE_URL=http://localhost:3000  (already set in .env.local)

# 1. Worker env — copy the template and fill in creds (RunPod, S3, data-cluster).
cp worker-v2/.env.example worker-v2/.env   # then edit

# 2. Terminal A — the app
npm run dev

# 3. Terminal B — the ingest worker (host, port 7777)
cd worker-v2 && npm start
```

Then open a project → **Ingest** → *Start ingestion*. The worker resolves each
record from the OpenAIRE Graph API, embeds abstracts/metadata (RunPod bge-m3),
registers into the data-cluster dataset `openaire-<projectId>`, and fires one
HMAC-signed terminal callback that advances the project's `ingestedVersionId`.
Full-text PDF ingestion is off by default (`FULLTEXT_ENABLED=false`, B-M1).

**Containerized alternative** (`docker compose --profile worker up`): builds the
worker image and reaches the host DB/app via `host.docker.internal`. When using
it, set the app's `WORKER_CALLBACK_BASE_URL=http://host.docker.internal:3000`
(the in-container worker cannot reach the host over `localhost`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm run smoke` | tsx scripts/smoke-test.ts — exercises advisory lock, no-op delta, better-auth |
| `npx prisma db seed` | Fake-data seed (offline, fast) — default |
| `cd worker-v2 && npm start` | Ingest worker (HTTP ingress on :7777) |
| `cd worker-v2 && npm test` | Worker test suite |

## Architecture in 60 seconds

- **Frontend + API**: Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4.
- **UI**: shadcn primitives + named feature components per `playbook/componentization.md`.
- **Data**: Prisma 7 + Postgres (via `@prisma/adapter-pg`).
- **Auth**: better-auth (email+password in slice 1; Alien SSO in a later slice).
- **Agent runtime**: `@alien/chat-sdk` as the base streaming layer; OpenAIRE domain layer (tools, prompts, persistence) on top.
- **OpenAIRE integration**: the corpus agent resolves records via the hosted mcp-openaire (`lib/openaire/client.ts`, wired in-band via chat-sdk `mcpServers` in `lib/agent/tools/registry-factory.ts`); the ingest worker resolves independently from the public OpenAIRE Graph API + ScholeXplorer (`worker-v2/src/openaire/`).

## Deploy target

**This app requires a long-running Node server. Do not deploy to Vercel functions or AWS Lambda.**

The turn runner (`lib/agent/runtime/runner.ts`) launches a background task via `queueMicrotask` after the HTTP response is returned. Serverless runtimes tear down the process when the request ends, killing the background turn immediately — the "decoupled turn" behaviour simply does not work there.

Supported targets:

- **Fly.io** (`fly.toml` with `[processes] web = "node server.js"`) — simplest option.
- **Railway** (Node service, no sleep).
- **Kubernetes pod** (long-running `Deployment`; set `terminationGracePeriodSeconds` ≥ 120 so in-flight turns can finish on rollout).
- **Bare Node** (`node .next/standalone/server.js` on a persistent VM).

The reaper (`lib/agent/runtime/reaper.ts`, started in `instrumentation.ts`) handles orphan recovery on restart: any `Message` with `status="streaming"` that is not in the in-memory `TurnRegistry` is marked `status="error"` within one `REAPER_INTERVAL_MS` (5 minutes) after boot.

## Where to find what

- **Design intent** — `design/docs/01..09` (frozen handoff; do not edit).
- **Engineering rules** — `playbook/README.md`.
- **Slice plans** — sibling `ai-memories/tech/repos/openaire/<slice>/`.
- **Implementation logs** — sibling `ai-memories/tech/repos/openaire/<slice>/implement/`.
