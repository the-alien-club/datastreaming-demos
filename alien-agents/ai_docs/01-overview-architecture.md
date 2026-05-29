# LDS Chatbot — Overview & Architecture

## What This Is

A Next.js demo app that lets users create, configure, and chat with AI agents backed by the Alien Intelligence workflow engine. Agents are real workflows persisted on the platform backend. The app wraps the workflow execution behind an OpenAI-compatible chat API, enabling standard chat libraries to interact with our agent system.

## Core User Flows

1. **Sign in** via Authentik (better-auth + genericOAuth)
2. **Create an agent** — builds a workflow on the platform with a deep agent node
3. **Configure the agent** — edit system prompt, add steps (concatenated into one prompt), attach specialist subagents with MCPs
4. **Upload documents** — create datasets on the data cluster, upload PDFs, wait for pipeline processing
5. **Attach a corpus** — create a specialist subagent that searches a specific dataset via the datacluster MCP
6. **Chat** — multi-turn conversation via OpenAI-compatible streaming endpoint
7. **Review conversations** — browse past conversations stored locally

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Standard, matches existing demos |
| Auth | better-auth + genericOAuth (Authentik) | Proven pattern from OpenAIRE demo |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, good defaults |
| Chat UI | Vercel AI SDK (`ai` + `@ai-sdk/react`) | `useChat` hook with streaming, works with custom endpoints |
| Local DB | SQLite + Drizzle ORM | Zero-config, file-based, perfect for a demo |
| Data Cluster SDK | `@alien/data-api-client` | Existing TypeScript SDK for dataset/entry operations |
| State | React Query (TanStack Query) | Server state management for datasets, agents |

## High-Level Architecture

```
Browser
  │
  ├─ /agents/*           Agent CRUD pages
  ├─ /agents/[id]/chat   Chat UI (Vercel AI SDK useChat)
  ├─ /datasets/*         Dataset management pages
  │
  └─ API Routes (Next.js server-side)
      │
      ├─ /api/auth/[...all]                         better-auth (Authentik OAuth)
      │
      ├─ /api/chat                                  Vercel AI SDK endpoint (internal)
      │   └─ Calls platform backend:
      │       POST /workflows/{id}/run              Start async job
      │       GET  /jobs/{id}/stream                SSE → read stream.agent.chunks
      │       Transform to Vercel AI text stream
      │
      ├─ /api/v1/agent/[id]/v1/chat/completions    OpenAI-compatible (external)
      │   └─ Same backend calls, returns OpenAI SSE format
      │
      ├─ /api/workflows/*                           Proxy to platform backend
      │   └─ POST /workflows                        Create/update workflows
      │       GET  /workflows/{id}                  Read workflow
      │
      └─ /api/clusters/[id]/proxy/*                 Proxy to data cluster
          └─ Via platform backend proxy:
              {BACKEND_URL}/clusters/{CLUSTER_ID}/proxy/api/v1/...
```

## Data Model (Local SQLite)

```
agents
  id            TEXT PRIMARY KEY (uuid)
  workflow_id   INTEGER NOT NULL        -- platform backend workflow ID
  name          TEXT NOT NULL
  description   TEXT
  system_prompt TEXT                     -- overall system prompt
  steps         TEXT                     -- JSON array of {name, prompt} objects
  model         TEXT DEFAULT 'gpt-4o-mini'
  created_at    DATETIME
  updated_at    DATETIME

agent_subagents
  id            TEXT PRIMARY KEY (uuid)
  agent_id      TEXT NOT NULL → agents.id
  name          TEXT NOT NULL            -- display name / description for the deep agent
  system_prompt TEXT NOT NULL
  model         TEXT DEFAULT 'gpt-4o-mini'
  mcp_ids       TEXT                     -- JSON array of MCP config IDs from static file
  dataset_id    TEXT                     -- if corpus-based, the dataset ID to inject
  node_id       TEXT                     -- the subagent node ID in the workflow graph
  created_at    DATETIME

conversations
  id            TEXT PRIMARY KEY (uuid)
  agent_id      TEXT NOT NULL → agents.id
  session_id    TEXT                     -- platform session_id for multi-turn
  title         TEXT
  created_at    DATETIME
  updated_at    DATETIME

messages
  id            TEXT PRIMARY KEY (uuid)
  conversation_id TEXT NOT NULL → conversations.id
  role          TEXT NOT NULL            -- 'user' | 'assistant' | 'system'
  content       TEXT NOT NULL
  metadata      TEXT                     -- JSON: {model, tokens, cost, tool_calls, agent_context}
  created_at    DATETIME

datasets
  id            TEXT PRIMARY KEY (uuid)
  cluster_dataset_id INTEGER             -- data cluster dataset ID
  name          TEXT NOT NULL
  description   TEXT
  status        TEXT DEFAULT 'pending'   -- pending | processing | ready | error
  agent_id      TEXT → agents.id         -- optional link to an agent
  created_at    DATETIME
  updated_at    DATETIME
```

## Directory Structure

```
sandbox/lds-chatbot/
├── ai_docs/                    # This plan
├── app/
│   ├── layout.tsx              # Root layout, providers
│   ├── page.tsx                # Landing → redirect to /agents
│   ├── (auth)/
│   │   └── sign-in/page.tsx    # Sign-in page
│   ├── (app)/
│   │   ├── layout.tsx          # Authenticated layout with sidebar
│   │   ├── agents/
│   │   │   ├── page.tsx        # Agent list
│   │   │   ├── new/page.tsx    # Create agent
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # Agent editor (prompt, steps, subagents)
│   │   │       └── chat/
│   │   │           ├── page.tsx           # New conversation
│   │   │           └── [conversationId]/
│   │   │               └── page.tsx       # Existing conversation
│   │   ├── datasets/
│   │   │   ├── page.tsx        # Dataset list
│   │   │   ├── new/page.tsx    # Create dataset + upload
│   │   │   └── [id]/page.tsx   # Dataset detail (entries, pipeline status)
│   │   └── conversations/
│   │       └── page.tsx        # All conversations across agents
│   └── api/
│       ├── auth/[...all]/route.ts          # better-auth
│       ├── chat/route.ts                   # Vercel AI SDK endpoint (internal)
│       ├── v1/agent/[id]/v1/
│       │   └── chat/completions/route.ts   # OpenAI-compatible endpoint
│       ├── workflows/route.ts              # Workflow CRUD proxy
│       └── datasets/[...path]/route.ts     # Data cluster proxy
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── agents/                 # Agent builder components
│   ├── chat/                   # Chat interface components
│   └── datasets/               # Dataset management components
├── lib/
│   ├── auth.ts                 # better-auth server instance
│   ├── auth-client.ts          # better-auth React client
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema
│   │   ├── index.ts            # DB connection
│   │   └── migrations/         # Drizzle migrations
│   ├── platform/
│   │   ├── client.ts           # Platform backend API client
│   │   ├── workflows.ts        # Workflow graph builder
│   │   └── types.ts            # Workflow/job types
│   ├── cluster/
│   │   └── client.ts           # Data cluster client (via proxy)
│   └── mcps/
│       └── config.json         # Static MCP server definitions
├── hooks/
│   ├── use-agents.ts           # Agent CRUD hooks
│   ├── use-chat.ts             # Chat hook wrapping useChat
│   └── use-datasets.ts         # Dataset hooks
├── drizzle.config.ts
├── package.json
├── next.config.mjs
├── tailwind.config.ts
└── .env.example
```

## Environment Variables

```bash
# Auth
NEXT_PUBLIC_AUTHENTIK_BASE_URL=https://auth.alien.club
AUTHENTIK_APP_SLUG=datastreaming
AUTHENTIK_CLIENT_ID=...
AUTHENTIK_CLIENT_SECRET=...
BETTER_AUTH_SECRET=...   # random 48-char string
BETTER_AUTH_URL=http://localhost:3000

# Platform Backend
PLATFORM_API_URL=https://api.alpha.alien.club
# or for local dev: http://localhost:3333

# Data Cluster
CLUSTER_ID=77            # cluster ID to proxy through

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Key Design Decisions

1. **Two chat endpoints**: `/api/chat` (Vercel AI format for the built-in UI) and `/api/v1/agent/[id]/v1/chat/completions` (OpenAI format for external consumers). They share the same backend logic.

2. **Workflow as source of truth**: The actual agent config (nodes, edges, params) lives in the platform backend as a workflow. The local SQLite stores metadata (name, description) and a `workflow_id` pointer. When editing, we read the workflow from backend, modify, and PUT back.

3. **Steps are UI-only**: "Steps" are sections of the system prompt. The UI lets you name and edit them separately, but they're concatenated into one `system_prompt` field on the deep agent node. The step definitions are stored locally in the `agents.steps` JSON column.

4. **Session-based multi-turn**: We use `session_id` on the deep agent for conversation continuity. The platform stores the conversation history server-side. We also store messages locally for the "review conversations" feature since there's no API to retrieve full session history.

5. **SQLite for simplicity**: A demo app doesn't need Postgres. SQLite + Drizzle gives us typed queries with zero infrastructure.
