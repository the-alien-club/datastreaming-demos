# LDS Chatbot — Implementation Phases

## Phase 0: Project Scaffolding

**Goal**: Standing Next.js app with basic config, all deps installed.

### Tasks

1. `npx create-next-app@latest lds-chatbot` in `sandbox/` with:
   - TypeScript, Tailwind, App Router, `src/` directory: NO (keep flat `app/`), ESLint
2. Install dependencies:
   ```bash
   npm install better-auth ai @ai-sdk/react
   npm install drizzle-orm better-sqlite3
   npm install -D drizzle-kit @types/better-sqlite3
   npm install @alien/data-api-client  # requires .npmrc
   npm install react-markdown remark-gfm
   npm install lucide-react class-variance-authority clsx tailwind-merge
   ```
3. Init shadcn/ui: `npx shadcn@latest init`
4. Add core shadcn components: button, input, textarea, card, dialog, select, badge, tabs, separator, dropdown-menu, avatar, sheet, scroll-area, label, toast
5. Set up Drizzle config (`drizzle.config.ts`) pointing to `sqlite.db`
6. Create `.env.example` with all required env vars
7. Create `.npmrc` for `@alien` registry
8. Create `.gitignore` including `sqlite.db`, `.env`

### Exit Criteria
- `npm run dev` starts without errors
- shadcn components render
- Drizzle can create and query the SQLite database

---

## Phase 1: Database & Auth

**Goal**: Users can sign in via Authentik. Local DB stores agents, conversations, messages.

### Tasks

1. Define Drizzle schema (`lib/db/schema.ts`):
   - `agents` table
   - `agentSubagents` table
   - `conversations` table
   - `messages` table
   - `datasets` table
2. Generate and run migration: `npx drizzle-kit generate` + `npx drizzle-kit migrate`
3. Create DB connection singleton (`lib/db/index.ts`)
4. Set up better-auth:
   - `lib/auth.ts` — server instance with Authentik genericOAuth
   - `lib/auth-client.ts` — client instance
   - `app/api/auth/[...all]/route.ts` — catch-all route
5. Create sign-in page (`app/(auth)/sign-in/page.tsx`)
6. Create auth guard in `app/(app)/layout.tsx`
7. Create sidebar layout with navigation

### Exit Criteria
- User can sign in via Authentik
- Session persists across page reloads
- Database tables created
- Protected routes redirect to sign-in

---

## Phase 2: Agent CRUD

**Goal**: Users can create, edit, and delete agents. Agents create real workflows on the platform backend.

### Tasks

1. Create platform API client (`lib/platform/client.ts`):
   - `createWorkflow(nodes, edges, name, slug, type)` 
   - `getWorkflow(id)`
   - `runWorkflow(id, input)`
   - `runWorkflowSync(id, input, timeout?)`
   - `streamJob(jobId)` — SSE consumer
2. Create workflow graph builder (`lib/platform/workflows.ts`):
   - `buildAgentWorkflow(config)` — full graph from config
   - `assembleSystemPrompt(overall, steps)` — concatenate prompt + steps
   - `addSubagentToWorkflow(workflow, subagentConfig)` — add subagent + MCP nodes + edges
   - `removeSubagentFromWorkflow(workflow, nodeId)` — remove subagent + cleanup
3. Create MCP config file (`lib/mcps/config.json`)
4. Create agent CRUD API routes:
   - `POST /api/agents` — create agent + workflow
   - `GET /api/agents` — list agents from local DB
   - `GET /api/agents/[id]` — get agent detail
   - `PUT /api/agents/[id]` — update agent (rebuild workflow)
   - `DELETE /api/agents/[id]` — delete agent
5. Create agent list page (`app/(app)/agents/page.tsx`)
6. Create new agent page (`app/(app)/agents/new/page.tsx`)
7. Create agent editor page (`app/(app)/agents/[id]/page.tsx`):
   - System prompt editor
   - Steps list (add, edit, remove, reorder)
   - Subagent list (add, edit, remove)
   - Model selector
   - Save button → rebuilds and pushes workflow

### Exit Criteria
- Create an agent → workflow appears on platform backend
- Edit system prompt → workflow updated on backend
- Add/remove subagents with MCPs → workflow graph updated correctly
- Steps concatenated into system prompt correctly

---

## Phase 3: Chat (Non-Streaming)

**Goal**: Users can chat with an agent. Messages stored locally. Multi-turn works via session_id.

### Tasks

1. Create chat bridge (`lib/platform/chat-bridge.ts`):
   - `runChatSync(workflowId, userMessage, sessionId, accessToken)` — run-sync and extract result
   - `extractResult(jobResult)` — navigate the response structure to get content + session_id + metadata
2. Create `/api/chat` route (initially non-streaming):
   - Accept messages + agentId + conversationId
   - Run workflow sync
   - Save messages to local DB
   - Return assistant message
3. Create conversation management:
   - `createConversation(agentId, title)`
   - `getConversation(id)` with messages
   - `saveMessage(conversationId, role, content, metadata)`
4. Create chat page (`app/(app)/agents/[id]/chat/page.tsx`):
   - useChat hook connected to `/api/chat`
   - Message rendering with markdown
   - Input with Enter to send
5. Create conversation page (`app/(app)/agents/[id]/chat/[conversationId]/page.tsx`):
   - Load existing messages
   - Continue conversation with session_id
6. Create conversations list page (`app/(app)/conversations/page.tsx`)

### Exit Criteria
- Send message → get response from agent
- Second message in same conversation → session_id maintained, agent has context
- Messages persisted in local DB
- Can browse and reopen past conversations

---

## Phase 4: Chat Streaming

**Goal**: Responses stream in real-time using the deep agent streaming infrastructure.

### Tasks

1. Update `/api/chat` route to streaming:
   - Use `createDataStream` from Vercel AI SDK
   - Start async job (`POST /workflows/{id}/run`)
   - Connect to SSE (`GET /jobs/{id}/stream`)
   - Forward `stream.agent.chunks` content as text stream
   - Save complete message after `done` event
2. Create SSE consumer utility (`lib/platform/sse.ts`):
   - `streamJobSSE(jobId, accessToken)` — async generator yielding SSE events
3. Update chat components for streaming:
   - Loading indicator while waiting for first token
   - Text appears progressively
   - Metadata shown after completion
4. Create OpenAI-compatible endpoint (`app/api/v1/agent/[id]/v1/chat/completions/route.ts`):
   - Accept OpenAI chat completion request
   - For `stream: false` → run-sync, return OpenAI response format
   - For `stream: true` → start job, SSE bridge, forward chunks in OpenAI SSE format
   - Chunks from `stream.agent.chunks[]` are already OpenAI format — just forward them

### Exit Criteria
- Chat responses stream token-by-token
- OpenAI-compatible endpoint works with curl:
  ```bash
  curl -X POST http://localhost:3000/api/v1/agent/abc/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <token>" \
    -d '{"messages":[{"role":"user","content":"hello"}],"stream":true}'
  ```
- Both streaming and non-streaming work
- Messages still saved correctly after stream completes

---

## Phase 5: Dataset Management

**Goal**: Users can create datasets, upload documents, and monitor pipeline processing.

### Tasks

1. Create cluster client (`lib/cluster/client.ts`):
   - SDK initialization with proxy URL and auth token
2. Create dataset API routes:
   - `POST /api/datasets` — create dataset + configure pipeline
   - `GET /api/datasets` — list from local DB + cluster status
   - `GET /api/datasets/[id]` — detail with entries
   - `POST /api/datasets/[id]/entries` — create entry + upload file
   - `GET /api/datasets/[id]/entries` — list entries with status
   - `DELETE /api/datasets/[id]` — delete dataset
3. Create dataset list page (`app/(app)/datasets/page.tsx`)
4. Create new dataset page (`app/(app)/datasets/new/page.tsx`):
   - Name + description form
   - File upload zone
   - Auto-creates dataset, configures pipeline, uploads files
5. Create dataset detail page (`app/(app)/datasets/[id]/page.tsx`):
   - Entry list with status badges
   - Upload more button
   - Auto-refresh while entries processing (10s polling)

### Exit Criteria
- Create a dataset → appears on data cluster
- Upload PDFs → entries created and pipeline triggered
- Status polling shows processing → processed transition
- Can upload additional documents to existing dataset

---

## Phase 6: Corpus Subagent

**Goal**: Users can attach a processed dataset to an agent as a corpus-specific subagent.

### Tasks

1. "Attach to Agent" dialog on dataset detail page:
   - Select agent from dropdown
   - Auto-generates subagent config (system prompt with dataset ID, Data Cluster MCP)
   - Adds subagent to workflow, saves
2. Corpus subagent shown in agent editor with special "corpus" badge
3. Update dataset status to show linked agent
4. Test end-to-end: upload docs → process → attach → chat and ask about the docs

### Exit Criteria
- Processed dataset can be attached to an agent
- Chatting with the agent can search and retrieve documents from the corpus
- Corpus subagent visible in agent editor

---

## Phase 7: Polish & Testing

**Goal**: Production-quality demo ready for presentation.

### Tasks

1. Error handling throughout (network errors, auth expiry, job failures)
2. Loading states and skeletons
3. Responsive design (works on mobile)
4. Toast notifications for success/error
5. Empty states ("No agents yet", "No conversations")
6. Keyboard shortcuts (Cmd+Enter to send, Escape to cancel)
7. Dark mode support (Tailwind dark: classes)
8. Manual end-to-end testing of all flows
9. README with setup instructions

### Exit Criteria
- All flows work without errors
- Looks professional for a demo
- README lets someone else set it up

---

## Dependency Order

```
Phase 0 (scaffold)
  → Phase 1 (db + auth)
    → Phase 2 (agent CRUD)
      → Phase 3 (chat non-streaming)
        → Phase 4 (chat streaming)    ← requires deep-agent-streaming to be deployed
      → Phase 5 (datasets)
        → Phase 6 (corpus subagent)
    → Phase 7 (polish)                ← can start after Phase 3
```

Phases 3→4 and 5→6 are two parallel tracks after Phase 2. Phase 4 depends on the deep-agent-streaming feature being deployed on the platform.

## Estimated Effort per Phase

| Phase | Description | Rough Size |
|-------|-------------|------------|
| 0 | Scaffold | Small |
| 1 | DB + Auth | Medium |
| 2 | Agent CRUD | Large (graph builder is the complex part) |
| 3 | Chat (sync) | Medium |
| 4 | Chat (streaming) | Medium |
| 5 | Datasets | Medium |
| 6 | Corpus | Small |
| 7 | Polish | Medium |
