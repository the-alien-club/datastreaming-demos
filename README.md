# Alien Intelligence Data Streaming Demos

Collection of demo applications showcasing [Alien Intelligence Data Streaming](https://datastreaming.ai/how-it-works) technology — real apps running real workflows against the Alien platform and data clusters.

## Demos

### Alien Agents — Agent Builder & RAG Workbench

**Location**: [`/alien-agents`](./alien-agents)

The public Alien demo (formerly the LDS Chatbot FDE for a client): a Next.js web app where users create AI agents backed by the Alien workflow engine, attach specialist subagents with MCP tool access, upload document datasets for RAG, and chat in a streaming multi-turn interface. Every agent is also exposed as an **OpenAI-compatible API endpoint** (Chat Completions and Responses), so any tool that speaks OpenAI can point at it and just work.

**Features:**
- Agent and specialist creation flows backed by the platform workflow engine
- Specialist subagents wired to MCP servers (custom or built-in)
- Dataset upload + processing pipeline (`general_purpose` preset) with status polling
- Streaming chat via the platform's OpenAI Responses API (native session resume)
- Authentik OAuth2/OIDC sign-in via better-auth
- French/English i18n; per-user data isolation; role-gated UI for `org-client` users

**Tech Stack**: Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui, Vercel AI SDK v6, Prisma + Postgres 16, better-auth, Authentik

**Quick Start:**
```bash
cd alien-agents
npm install
cp .env.example .env   # fill in Authentik + platform vars
docker compose up -d   # local Postgres
npm run db:migrate
npm run dev
```

See [alien-agents/README.md](./alien-agents/README.md) for full setup and [alien-agents/CLAUDE.md](./alien-agents/CLAUDE.md) for architecture details.

---

### OpenAIRE — Research Intelligence Multi-Agent System

**Location**: [`/openaire`](./openaire)

A multi-agent research intelligence app over the OpenAIRE Research Graph (600M+ research products, 2.25B+ citation relationships). The frontend orchestrates 5 specialized agents that call a dedicated MCP server exposing 17 tools spanning search, citation analysis, network analysis, author/project intelligence, semantic relationships, and trend analysis.

**Features:**
- 5 specialized agents: Data Discovery, Citation Impact, Network Analysis, Trends Analysis, Visualization
- 17 MCP tools across 6 categories (search & discovery, citation impact classes, citation/coauthorship networks, author profiles, semantic relationships, temporal trends)
- Interactive D3-powered network and citation graph visualizations
- Authentik OAuth2/OIDC with token forwarding to the MCP server (OIDC introspection mode)
- Monorepo: `packages/frontend` (Next.js) + `packages/mcp` (MCP server) + `packages/viz-mcp` (viz tools)

**Tech Stack**: Next.js 14, React, TypeScript, Tailwind, shadcn/ui, Anthropic Claude Agent SDK, d3-force, better-auth, Authentik, MCP

**Quick Start:**
```bash
cd openaire
./setup.sh
./run.sh
```

See [openaire/how-it-works/README.md](./openaire/how-it-works/README.md) for the full architecture, agent design, and MCP tool reference.

---

### Avatar — Persona as a Service

**Location**: [`/avatar`](./avatar)

Voice-enabled chat application demonstrating "Persona as a Service" with AI personas backed by a vector knowledge base.

**Features:**
- Voice-activated recording with automatic silence detection
- Speech-to-Text (ElevenLabs) and Text-to-Speech with voice cloning
- RAG-powered responses with vector knowledge base
- Multiple conversation management per persona
- Continuous conversation loop with auto-restart
- Modern dark UI with real-time animations
- Secure server-side API architecture

**Tech Stack**: Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui, ElevenLabs

**Quick Start:**
```bash
cd avatar
npm install
# Add .env.local with API keys
npm run dev
```

See [avatar/README.md](./avatar/README.md) for full documentation.

---

## Learn More

- [Alien Intelligence Data Streaming](https://datastreaming.ai/how-it-works)
- [How it Works](https://datastreaming.ai/how-it-works)
