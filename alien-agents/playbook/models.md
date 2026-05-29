# Domain Model Rule

## Rule

Every domain model lives in its own directory under `models/` at the project root. Each directory contains exactly five files — no more, no fewer. Nothing about a domain is scattered across the codebase.

---

## Directory Structure

```
models/
  agents/
    schema.ts
    queries.ts
    service.ts
    policy.ts
    types.ts
  datasets/
    schema.ts
    queries.ts
    service.ts
    policy.ts
    types.ts
  specialists/
    schema.ts
    queries.ts
    service.ts
    policy.ts
    types.ts
  mcps/
    schema.ts
    queries.ts
    service.ts
    policy.ts
    types.ts
  conversations/
    schema.ts
    queries.ts
    service.ts
    policy.ts
    types.ts
```

One directory per domain. The five files are the same across every domain. There is no sixth file and no subdirectory.

---

## File Responsibilities

### `schema.ts` — table definition and domain constants

Drizzle table definition for this model. All enums and constants that express domain values (status codes, modes, roles) that belong to this model live here — not in `app/api/`, not in `components/`.

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const AGENT_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const
export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS]

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  status: text("status").$type<AgentStatus>().notNull().default(AGENT_STATUS.ACTIVE),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
```

Rules:
- No imports from other model directories — `schema.ts` is the foundation layer
- No imports from `app/`, `components/`, `hooks/`, or `lib/platform/`
- Enums are plain `const` objects with a companion type, not TypeScript `enum` keyword
- Export both `$inferSelect` and `$inferInsert` aliases with domain names (`Agent`, `NewAgent`)

### `queries.ts` — server-only database access

Pure database access functions. No business logic, no external calls, no transformations beyond what Drizzle returns.

```ts
import "server-only"

import { db } from "@/lib/db"
import { agents } from "./schema"
import { eq, and } from "drizzle-orm"
import type { Agent } from "./schema"

export async function getAgents(userId: string): Promise<Agent[]> {
  return db.select().from(agents).where(eq(agents.userId, userId))
}

export async function getAgent(id: string, userId: string): Promise<Agent | undefined> {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .limit(1)
  return rows[0]
}

export async function insertAgent(values: typeof agents.$inferInsert): Promise<Agent> {
  const rows = await db.insert(agents).values(values).returning()
  return rows[0]
}

export async function updateAgent(id: string, values: Partial<typeof agents.$inferInsert>): Promise<Agent> {
  const rows = await db.update(agents).set(values).where(eq(agents.id, id)).returning()
  return rows[0]
}

export async function deleteAgent(id: string): Promise<void> {
  await db.delete(agents).where(eq(agents.id, id))
}
```

Rules:
- `import "server-only"` is the first line, always — this file must never be bundled into the client
- Returns Drizzle-inferred types directly; no manual type mapping
- Imports only from `@/lib/db` and `./schema`
- Functions are named after the operation: `getAgents`, `getAgent`, `insertAgent`, `updateAgent`, `deleteAgent`
- Queries from other models may be imported in `service.ts` — never in `queries.ts`

### `service.ts` — business logic

Orchestrates queries and external API calls. This is where the logic lives that belongs to neither the route handler nor the database layer.

```ts
import { getAgent, insertAgent, updateAgent, deleteAgent } from "./queries"
import { createWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow } from "@/lib/platform/workflows"
import type { Agent } from "./schema"
import type { CreateAgentData, UpdateAgentData } from "./types"

export async function createAgent(
  userId: string,
  data: CreateAgentData,
  token: string
): Promise<Agent> {
  const graph = buildAgentWorkflow(data)
  const workflow = await createWorkflow(graph, token)
  return insertAgent({ userId, workflowId: workflow.id, ...data })
}

export async function updateAgentById(
  id: string,
  data: UpdateAgentData,
  token: string
): Promise<Agent> {
  const agent = await getAgent(id, data.userId)
  if (!agent) throw new Error(`Agent ${id} not found`)

  const graph = buildAgentWorkflow(data)
  await updateWorkflow(agent.workflowId, graph, token)
  return updateAgent(id, data)
}

export async function deleteAgentById(id: string, token: string): Promise<void> {
  const agent = await getAgent(id, /* caller guarantees ownership */)
  if (!agent) throw new Error(`Agent ${id} not found`)
  await deleteWorkflow(agent.workflowId, token)
  await deleteAgent(id)
}
```

Rules:
- Server-only; never imported by client components
- Throws typed errors — not `Response` objects, not `NextResponse`; route handlers turn service errors into responses
- May import queries from this model and from other models
- May import from `lib/platform/` for external API calls
- Does not contain auth checks — the route handler verifies identity before calling a service function; the service receives a verified `userId`

### `policy.ts` — authorization rules

A single exported class that encapsulates every authorization decision for this model. Route handlers call the policy after loading the resource; the resource is passed in, never fetched inside the policy.

```ts
import type { Session } from "@auth/core/types"
import type { Agent } from "./schema"

type User = Session["user"]

export class AgentPolicy {
  before(user: User): boolean | undefined {
    if (user.role === "admin") return true
    return undefined
  }

  view(user: User, agent: Agent): boolean {
    return agent.userId === user.id || agent.isPublic
  }

  create(user: User): boolean {
    return user.role !== "org-client"
  }

  edit(user: User, agent: Agent): boolean {
    return agent.userId === user.id
  }

  delete(user: User, agent: Agent): boolean {
    return agent.userId === user.id
  }
}
```

Usage in a route handler:

```ts
const policy = new AgentPolicy()
const agent = await getAgent(id, userId)
if (!agent) return notFound()

const canEdit = policy.before(user) ?? policy.edit(user, agent)
if (!canEdit) return unauthorized()
```

Rules:
- One exported class per file, named `[Model]Policy`
- `before()` is the admin bypass — returning `true` short-circuits all action methods; returning `undefined` falls through to the specific action check
- Action methods return `boolean` or `Promise<boolean>` — nothing else
- No DB calls inside methods — the resource is always passed in from outside
- Imports only from `./schema` for types; no imports from `queries.ts`, `service.ts`, or anywhere in `app/`

### `types.ts` — Zod schemas and request/response types

Zod schemas for request validation and their inferred TypeScript types. These are the types that route handlers validate against and that hooks import for end-to-end type safety.

```ts
import { z } from "zod"

const NAME = z.string().trim().min(1, "must be non-empty").max(120, "max 120 chars")
const SHORT_TEXT = z.string().max(2_000, "max 2 000 chars")

export const createAgentSchema = z.object({
  name: NAME,
  description: SHORT_TEXT.optional(),
  systemPrompt: z.string().trim().min(1, "systemPrompt is required").max(128_000),
  model: z.string().trim().min(1).max(120).optional(),
  steps: z.array(
    z.object({ name: NAME, prompt: z.string().trim().min(1).max(16_000) })
  ).default([]),
})
export type CreateAgentData = z.infer<typeof createAgentSchema>

export const updateAgentSchema = createAgentSchema
export type UpdateAgentData = z.infer<typeof updateAgentSchema>
```

Rules:
- Export both the Zod schema and the inferred type; the type name is the schema name without the `Schema` suffix
- Schemas in `types.ts` replace model-specific schemas previously defined in `app/api/_validators.ts`; route handlers import from here, not from `_validators.ts`
- No imports from `app/`, `components/`, or `lib/platform/`
- No Drizzle imports — response shapes are typed via `$inferSelect` aliases from `schema.ts`, not redefined here

---

## Import Diagram

```
types.ts      ← zod (no internal imports)
schema.ts     ← drizzle (no internal imports)
queries.ts    ← lib/db, ./schema
policy.ts     ← ./schema
service.ts    ← ./queries, ./types, lib/platform/, other models' queries
─────────────────────────────────────────────────────────────
app/api/      ← ./queries (reads), ./service (writes), ./policy, ./types
hooks/        ← ./types (response types only)
```

The arrows are one-directional. Nothing below the line imports from `app/` or `components/`. Nothing in `queries.ts` or `schema.ts` reaches sideways into another model.

---

## Forbidden Patterns

```ts
// ❌ Domain enum defined outside models/
// In components/agents/status-badge.tsx:
const STATUS_LABELS = { active: "Active", archived: "Archived" }
// → move to models/agents/schema.ts

// ❌ Query function in lib/queries/
// lib/queries/agents.ts: export async function getAgents(...) { ... }
// → move to models/agents/queries.ts

// ❌ Business logic in a route handler
// app/api/agents/[id]/route.ts:
const workflow = await createWorkflow(graph, token)
const agent = await db.insert(agents).values({ workflowId: workflow.id, ...body }).returning()
// → belongs in models/agents/service.ts

// ❌ Inline authorization in a route handler
if (agent.userId !== session.user.id) return unauthorized()
// → belongs in models/agents/policy.ts

// ❌ Types duplicated between route and hook
// In app/api/agents/route.ts:   type AgentResult = { id: string; name: string }
// In hooks/api/agents.ts:       type AgentResult = { id: string; name: string }
// → define once in models/agents/types.ts, import in both places

// ❌ models/ file importing from app/ or components/
// In models/agents/service.ts:
import { toast } from "@/components/ui/sonner"  // never
```

---

## Migration Map

| Old location | New location |
|---|---|
| `lib/queries/agents.ts` | `models/agents/queries.ts` |
| `lib/queries/datasets.ts` | `models/datasets/queries.ts` |
| `app/api/_validators.ts` — agent schemas | `models/agents/types.ts` |
| `app/api/_validators.ts` — dataset schemas | `models/datasets/types.ts` |
| `lib/db/schema.ts` — agents table + enums | `models/agents/schema.ts` |
| `lib/db/schema.ts` — datasets table + enums | `models/datasets/schema.ts` |

After migration, `lib/db/schema.ts` becomes a barrel that re-exports all model schemas for Drizzle's registry. Drizzle requires all tables in one object for migration generation; the barrel satisfies that without defining anything itself:

```ts
// lib/db/schema.ts — barrel only, no definitions
export * from "@/models/agents/schema"
export * from "@/models/datasets/schema"
export * from "@/models/specialists/schema"
export * from "@/models/mcps/schema"
export * from "@/models/conversations/schema"
```

`drizzle.config.ts` points at this barrel unchanged.

---

## Relation to Other Rules

- Route handlers call `service.ts` for mutations and `queries.ts` for reads — never Drizzle inline. See `api-routes.md`.
- `parseBody` in route handlers validates against schemas exported from `types.ts`, not from `app/api/_validators.ts`. The `_validators.ts` file is progressively emptied as models are migrated.
- Response types travel from `models/[model]/schema.ts` (`$inferSelect`) → route handler → hook with no intermediate redefinition. See `api-routes.md` — Step 1.
