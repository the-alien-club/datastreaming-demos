# Data Fetching Rule

## Rule

All data flows through two dedicated layers: server queries in `lib/queries/` and TanStack Query hooks in `hooks/api/`. No client component fetches data any other way.

---

## `lib/queries/[model].ts` — Server Queries

```
lib/queries/agents.ts
lib/queries/datasets.ts
lib/queries/specialists.ts
lib/queries/mcps.ts
```

- **Server-only** — never imported by a client component, never called from a hook
- Every function is `async`, explicitly typed, and receives only the arguments it needs (`userId`, `id`, filters)
- `page.tsx` calls these directly — it never reaches into Drizzle or the platform client itself
- Functions are named `getAgents`, `getAgent`, `createAgent`, etc. — plain verbs, no ceremony

```ts
// lib/queries/agents.ts
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"

export type AgentWithSubagents = typeof agents.$inferSelect & {
  subagents: (typeof agentSubagents.$inferSelect)[]
  isOwn: boolean
}

export async function getAgents(userId: string): Promise<AgentWithSubagents[]> {
  const [ownRows, publicRows] = await Promise.all([
    db.query.agents.findMany({
      where: eq(agents.userId, userId),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
    db.query.agents.findMany({
      where: and(eq(agents.isPublic, true), ne(agents.userId, userId)),
      orderBy: [desc(agents.createdAt)],
      with: { subagents: true },
    }),
  ])
  return [
    ...ownRows.map((r) => ({ ...r, isOwn: true })),
    ...publicRows.map((r) => ({ ...r, isOwn: false })),
  ]
}

export async function getAgent(
  id: string,
  userId: string,
): Promise<AgentWithSubagents | undefined> {
  const row = await db.query.agents.findFirst({
    where: and(eq(agents.id, id), eq(agents.userId, userId)),
    with: { subagents: true },
  })
  return row ? { ...row, isOwn: true } : undefined
}
```

**What these functions are not:**
- They do not call `apiFetch` or any HTTP client
- They do not carry auth session handling — the caller (page) resolves auth and passes `userId`
- They do not return `Response` objects

---

## `hooks/api/[model].ts` — TanStack Query Hooks

```
hooks/api/agents.ts
hooks/api/datasets.ts
hooks/api/specialists.ts
hooks/api/mcps.ts
```

- Every file is a client module — `"use client"` is required
- `useQuery` for reads, `useMutation` for writes
- Query keys are defined once at the top as a `const` object — never inlined at the call site
- Every mutation's `onSuccess` calls `queryClient.invalidateQueries` on the relevant key(s)
- Response types come from `@/app/api/_validators.ts` via `z.infer` — never typed by hand in the hook
- All HTTP calls go through `apiFetch` from `@/lib/api-fetch.ts` — never raw `fetch()`

### Complete example — `hooks/api/agents.ts`

```ts
"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-fetch"
import type { z } from "zod"
import type { createAgentBodySchema, updateAgentBodySchema } from "@/app/api/_validators"

// ── Types ──────────────────────────────────────────────────────────────────

// The route returns Drizzle rows directly. Import the inferred type from
// the schema rather than duplicating fields here.
import type { AgentWithSubagents } from "@/lib/queries/agents"

export type CreateAgentInput = z.infer<typeof createAgentBodySchema>
export type UpdateAgentInput = z.infer<typeof updateAgentBodySchema>

// ── Query keys ─────────────────────────────────────────────────────────────

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
}

// ── Read hooks ─────────────────────────────────────────────────────────────

export function useAgents() {
  return useQuery<AgentWithSubagents[]>({
    queryKey: agentKeys.all,
    queryFn: async () => {
      const res = await apiFetch("/api/agents")
      if (!res.ok) throw new Error("Failed to fetch agents")
      return res.json()
    },
  })
}

export function useAgent(id: string) {
  return useQuery<AgentWithSubagents>({
    queryKey: agentKeys.detail(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/agents/${id}`)
      if (!res.ok) throw new Error("Failed to fetch agent")
      return res.json()
    },
    enabled: !!id,
  })
}

// ── Write hooks ────────────────────────────────────────────────────────────

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation<AgentWithSubagents, Error, CreateAgentInput>({
    mutationFn: async (body) => {
      const res = await apiFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed to create agent")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient()
  return useMutation<AgentWithSubagents, Error, UpdateAgentInput>({
    mutationFn: async (body) => {
      const res = await apiFetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed to update agent")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await apiFetch(`/api/agents/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete agent")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}
```

### Naming convention

| Operation | Hook name |
|---|---|
| List | `useAgents` |
| Single | `useAgent(id)` |
| Create | `useCreateAgent` |
| Update | `useUpdateAgent(id)` |
| Delete | `useDeleteAgent` |

---

## Rule: No Inline Data Fetching in Client Components

Client components receive data from TanStack Query hooks. They do not own the fetch lifecycle.

**Correct:**
```tsx
"use client"

import { useAgents } from "@/hooks/api/agents"

export function AgentsClient() {
  const { data: agents, isLoading } = useAgents()
  // ...
}
```

**Forbidden:**
```tsx
// ❌ useEffect + fetch — no query key, no cache, no deduplication
useEffect(() => {
  fetch("/api/agents").then(r => r.json()).then(setAgents)
}, [])

// ❌ useState for server data — bypasses the cache entirely
const [agents, setAgents] = useState<Agent[]>([])

// ❌ apiFetch inside a component body — runs on every render
const res = await apiFetch("/api/agents")
```

The `initial*` props passed from `page.tsx` seed the TanStack Query cache via `initialData` — they do not replace the hook:

```tsx
// page.tsx feeds the cache; the hook reads from it.
export function AgentsClient({ initialAgents }: { initialAgents: AgentWithSubagents[] }) {
  const { data: agents } = useAgents({ initialData: initialAgents })
  // ...
}
```

---

## Relation to Other Rules

- Server queries are called by `page.tsx` following the **page/client split rule** — the server component fetches, the client component renders
- Mutation hooks invalidate query keys so lists and detail views stay in sync without manual state updates
- The `apiFetch` wrapper is mandatory because Next.js `basePath` is not applied to raw `fetch()` calls from the browser
