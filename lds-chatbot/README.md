# LDS Chatbot

An AI-powered research assistant that lets users create agents, attach literature dataset corpora, and chat with streaming responses — backed by the DataStreaming platform.

## Prerequisites

- Node.js 20+
- npm
- Access to the DataStreaming platform backend (API URL + API key)
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
   | `AUTHENTIK_CLIENT_ID` | OAuth2 client ID from your Authentik application |
   | `AUTHENTIK_CLIENT_SECRET` | OAuth2 client secret from your Authentik application |
   | `BETTER_AUTH_SECRET` | Random 48-character secret for session signing (e.g. `openssl rand -base64 48`) |
   | `PLATFORM_API_URL` | Base URL of the DataStreaming platform backend |
   | `PLATFORM_API_KEY` | API key for authenticating server-to-server calls to the platform |
   | `CLUSTER_ID` | Numeric ID of the data cluster to query (default: `77`) |

3. **Run database migrations**

   ```bash
   npx drizzle-kit migrate
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app opens at [http://localhost:3000](http://localhost:3000).

## Usage

- **Sign in** — authenticate via your Authentik account; the app uses OAuth2/OIDC
- **Create agents** — define named agents with a system prompt that shapes how they respond
- **Chat** — open a conversation with any agent and receive streaming AI responses
- **Upload datasets** — attach corpus subagents to agents so they can search across your literature datasets during chat

## Notes

- The Authentik application slug **must** be `datastreaming` (configured in `AUTHENTIK_APP_SLUG`)
- The OAuth2 redirect URI must be registered in Authentik as:
  `${BETTER_AUTH_URL}/api/auth/oauth2/callback/authentik`
  (default for local dev: `http://localhost:3000/api/auth/oauth2/callback/authentik`)
