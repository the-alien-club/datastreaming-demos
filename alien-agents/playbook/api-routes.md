# API Routes Rule

## Rule

Every internal API route validates its inputs, returns an explicitly typed response, and uses the shared helpers from `lib/api-response.ts` and `app/api/_validators.ts`. No exceptions.

---

## Structure

```
app/api/[model]/route.ts          ← GET (list) + POST (create)
app/api/[model]/[id]/route.ts     ← GET (single) + PUT (update) + DELETE
```

Examples:
```
app/api/agents/route.ts
app/api/agents/[id]/route.ts
app/api/datasets/route.ts
app/api/datasets/[id]/route.ts
app/api/mcps/route.ts
app/api/mcps/[id]/route.ts
```

---

## Validation — Every Route, No Exceptions

Request bodies are validated with `parseBody(req, schema)` from `app/api/_validators.ts`. Query params are validated with Zod before use.

`parseBody` reads the body once, runs `schema.safeParse`, and returns either the typed result or a `Response` with a structured 400. The caller forwards the `Response` directly:

```ts
const parsed = await parseBody(request, mySchema)
if (parsed instanceof Response) return parsed
const body = parsed  // fully typed, no `as Foo` casts needed
```

There is no alternative path. `req.json()` is never called directly.

---

## Return Types — Every Route Explicitly Typed

Response shapes are defined as Zod schemas in `app/api/_validators.ts`. Types are inferred with `z.infer` and exported from that file. Routes use `ok<ResponseType>(data)` from `@/lib/api-response.ts`. This means the hook can import the type and `useQuery<ResponseType>` is fully typed with zero manual work.

The `ok` helper signature:
```ts
export function ok<T>(data: T, init?: number | ResponseInit): Response
```

Error helpers: `badRequest`, `notFound`, `unauthorized`, `conflict`, `unprocessable` — all return structured `{ error: string, issues?: unknown }` bodies.

---

## Complete Pattern Example

### Step 1 — `app/api/_validators.ts`: define both the request schema and the response type

```ts
import { z } from "zod"

const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2000 chars")
const ID = z.string().trim().min(1, "must be non-empty")

// ── Request schemas ────────────────────────────────────────────────────────

export const createAgentBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(128_000),
  model: z.string().trim().min(1).max(120).optional(),
  steps: z.array(z.object({ name: NAME, prompt: z.string().trim().min(1).max(16_000) })).default([]),
  subagents: z.array(subagentConfigSchema).default([]),
})

export const updateAgentBodySchema = z.object({
  name: NAME,
  description: SHORT_TEXT.nullable().optional(),
  systemPrompt: z.string().trim().max(128_000),
  model: z.string().trim().min(1).max(120),
  steps: z.array(z.object({ name: NAME, prompt: z.string().trim().min(1).max(16_000) })),
  subagents: z.array(subagentConfigSchema),
})

// ── Response types ─────────────────────────────────────────────────────────

// Infer types from the DB schema's $inferSelect — never write them by hand.
// These are the types the route returns and the hook imports.
export type AgentResponse = typeof agents.$inferSelect & {
  subagents: (typeof agentSubagents.$inferSelect)[]
  isOwn: boolean
}

export type AgentListResponse = AgentResponse[]
```

### Step 2 — `app/api/agents/route.ts`: use both schemas and types

```ts
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { ok, unauthorized } from "@/lib/api-response"
import { createAgentBodySchema, parseBody } from "../_validators"
import type { AgentListResponse, AgentResponse } from "../_validators"
import { getAgents } from "@/lib/queries/agents"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const rows = await getAgents(session.user.id)
  return ok<AgentListResponse>(rows)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const parsed = await parseBody(request, createAgentBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed  // type: z.infer<typeof createAgentBodySchema>

  // ... build workflow, insert to DB ...

  return ok<AgentResponse>(created, 201)
}
```

### Step 3 — `hooks/api/agents.ts`: import the response type, zero duplication

```ts
"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-fetch"
import type { AgentListResponse, AgentResponse, createAgentBodySchema } from "@/app/api/_validators"
import type { z } from "zod"

export type CreateAgentInput = z.infer<typeof createAgentBodySchema>

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
}

export function useAgents() {
  // AgentListResponse comes straight from _validators — no manual typing
  return useQuery<AgentListResponse>({
    queryKey: agentKeys.all,
    queryFn: async () => {
      const res = await apiFetch("/api/agents")
      if (!res.ok) throw new Error("Failed to fetch agents")
      return res.json()
    },
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation<AgentResponse, Error, CreateAgentInput>({
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
```

The type travels `_validators.ts` → route → hook with no intermediate manual definitions.

---

## Forbidden Patterns

```ts
// ❌ req.json() without parseBody — no validation, any shape gets through
const body = await req.json()
const { name, model } = body

// ❌ Response.json() instead of ok() — inconsistent envelope across routes
return Response.json({ id: agent.id })

// ❌ NextResponse.json() — use ok() for uniformity
return NextResponse.json(agent, { status: 201 })

// ❌ Route with no explicit return type annotation
export async function POST(req: NextRequest) {
  // ...
  return ok(created)  // ← TypeScript can't verify the shape the hook expects
}

// ❌ Type manually duplicated between route and hook
// In route:
type AgentResult = { id: string; name: string; model: string }
// In hook:
type AgentResult = { id: string; name: string; model: string }  // ← guaranteed to drift
```

---

## Relation to Other Rules

- `parseBody` is the enforcement point for the anti-pattern ban on unvalidated inputs described in `CLAUDE_ERROR_PATTERNS.md §1`
- Response types exported from `_validators.ts` are the single source of truth — hooks import them, they never redefine them
- Routes call `lib/queries/` functions for reads; they never construct Drizzle queries inline
- The `ok` / `badRequest` / `unauthorized` helpers in `lib/api-response.ts` are the only way to build a response — raw `Response.json()` and `NextResponse.json()` are off-limits in route files
