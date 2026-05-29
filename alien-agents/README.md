# Alien Agents

An AI-powered research assistant that lets users create agents, attach literature dataset corpora, and chat with streaming responses — backed by the Alien DataStreaming platform.

## Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose (for the local Postgres dev DB)
- Access to the DataStreaming platform backend
- An Authentik application configured with the `datastreaming` slug

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in the following variables:

   | Variable | Description |
   |---|---|
   | `DATABASE_URL` | Postgres connection string (default `postgres://postgres:postgres@localhost:5435/alien_agents`) |
   | `AUTHENTIK_BASE_URL` | Base URL of your Authentik instance (e.g. `https://auth.alien.club`) |
   | `AUTHENTIK_APP_SLUG` | Authentik application slug (default: `datastreaming`) |
   | `AUTHENTIK_CLIENT_ID` | OAuth2 client ID from your Authentik application |
   | `AUTHENTIK_CLIENT_SECRET` | OAuth2 client secret from your Authentik application |
   | `BETTER_AUTH_URL` | Bare host the app is reachable at (e.g. `http://localhost:3000`) |
   | `BETTER_AUTH_SECRET` | Random 48-character secret for session signing (`openssl rand -base64 48`) |
   | `NEXT_PUBLIC_BASE_PATH` | URL prefix the Next.js app is mounted at (default: empty for root) |
   | `PLATFORM_API_URL` | Base URL of the DataStreaming platform backend |
   | `CLUSTER_ID` | Numeric ID of the data cluster to query against |
   | `DATACLUSTER_MCP_URL` | Override URL for the data-cluster MCP server (optional) |

   The platform API uses the user's Authentik OAuth access token (forwarded
   in `x-oauth-access-token`) — there is no static `PLATFORM_API_KEY`.

3. **Bring up the local Postgres**

   ```bash
   docker compose up -d
   ```

4. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app opens at [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Run the vitest suite |
| `npm run lint` | ESLint over the whole tree |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a new drizzle migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending drizzle migrations |
| `npm run auth:migrate` | Apply better-auth migrations (first run only) |

## Usage

- **Sign in** — authenticate via your Authentik account (OAuth2/OIDC).
- **Create agents** — define named agents with a system prompt that shapes how they respond.
- **Chat** — open a conversation with any agent and receive streaming AI responses.
- **Upload datasets** — attach corpus subagents to agents so they can search across your literature datasets during chat.

## Page-rendering convention

List pages mix two strategies; pick by data shape:

- **Server component (Drizzle in render)** — `agents`, `specialists`,
  `conversations`. Data comes from local Postgres and is read-only at
  page load; the SSR query is fast, no spinner needed.
- **Client component (`useEffect` → `apiFetch`)** — `datasets`, `mcps`.
  These need imperative actions (delete, toggle enabled, polling status)
  that benefit from local state, so they fetch from the user's session.

When in doubt, prefer the server-component pattern unless the page needs
to invalidate / refetch its own data in response to a UI action.

## Notes

- The Authentik application slug **must** match `AUTHENTIK_APP_SLUG` (default `datastreaming`).
- The OAuth2 redirect URI must be registered in Authentik as:
  `${BETTER_AUTH_URL}${NEXT_PUBLIC_BASE_PATH}/api/auth/oauth2/callback/authentik`
  (default for local dev: `http://localhost:3000/api/auth/oauth2/callback/authentik`).
- All user-owned data (agents, MCPs, specialists, datasets, conversations) is
  scoped per better-auth user; rows from other users are never reachable
  via the API.
