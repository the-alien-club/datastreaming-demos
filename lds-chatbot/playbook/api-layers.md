# API Layers Rule

## Rule

Every route that touches a protected resource goes through three layers in strict order: `withAuth` injects the authenticated user and bouncer, a Policy class makes the authorization decision, and a Service class performs the business logic. Route handlers wire these layers together — they do not own any of the logic themselves.

---

## The Stack

```
Route handler          ← thin wiring, 5-15 lines
  → withAuth()         ← injects user + bouncer, catches 401/403
      → parseBody()    ← Zod validation → 400
      → Queries        ← load resource (needed before policy check)
      → bouncer.with(Policy).authorize("action", resource)
      → Service        ← business logic + external calls
      → ok<T>()        ← typed response
```

Each layer has a single job. Blurring the boundaries is not a style issue — it means auth logic ends up in services, business logic ends up in route handlers, and authorization ends up scattered everywhere as `if (agent.userId !== user.id)` checks that reviewers miss.

---

## Layer 1 — `app/api/_middleware.ts` — withAuth

`withAuth` is the only entry point for authenticated routes. It resolves the session, injects the user and a pre-scoped bouncer, and catches `AuthorizationError` so route handlers never need to.

```ts
// app/api/_middleware.ts
import { auth } from "@/lib/auth"
import { bouncer, type Bouncer } from "@/lib/bouncer"
import { unauthorized, forbidden } from "@/lib/api-response"
import { AuthorizationError } from "@/lib/bouncer"
import type { User } from "@/lib/db/schema"

export function withAuth(
  handler: (req: Request, user: User, bouncer: Bouncer) => Promise<Response>
) {
  return async (req: Request) => {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return unauthorized()
    try {
      return await handler(req, session.user, bouncer(session.user))
    } catch (e) {
      if (e instanceof AuthorizationError) return forbidden()
      throw e
    }
  }
}
```

Rules:
- Every route handler that needs auth must use `withAuth` — no inline `auth.api.getSession()` calls
- `withAuth` is the only way to get the authenticated `user` object in a route
- `withAuth` automatically catches `AuthorizationError` and returns 403; route handlers never catch it themselves
- Streaming routes (`/api/chat`, `/api/chat/resume`) are exempt — they handle auth manually because they control the response stream directly

---

## Layer 2 — `lib/bouncer.ts` — Bouncer

The bouncer is a thin wrapper that binds a policy class to a user and calls `authorize`. It does not contain policy logic — it just dispatches.

```ts
// lib/bouncer.ts

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "AuthorizationError"
  }
}

export interface Policy<Resource = void> {
  before?(user: User): boolean | undefined
}

export interface Bouncer {
  with<P extends Policy<any>>(
    PolicyClass: new (user: User) => P
  ): {
    authorize(action: keyof P & string, resource?: any): Promise<void>
  }
}

export function bouncer(user: User): Bouncer {
  return {
    with(PolicyClass) {
      const policy = new PolicyClass(user)
      return {
        async authorize(action, resource) {
          // `before()` is the admin bypass hook.
          // If it returns `true`, all action checks are skipped.
          // If it returns `undefined` or `false`, the action check proceeds.
          if (policy.before?.(user) === true) return

          const method = (policy as any)[action]
          if (typeof method !== "function") {
            throw new AuthorizationError(`No policy method for action "${action}"`)
          }
          const allowed = await method.call(policy, resource)
          if (!allowed) throw new AuthorizationError()
        },
      }
    },
  }
}
```

Rules:
- Policies are classes in `models/[model]/policy.ts`
- Every action that touches a resource must be authorized: `await bouncer.with(AgentPolicy).authorize("edit", agent)`
- Authorize **after** loading the resource, **before** calling the service — the policy needs the resource to make a decision
- `create` actions authorize before any DB operations, and receive no resource: `await bouncer.with(AgentPolicy).authorize("create")`
- `withAuth` catches `AuthorizationError`; route handlers never catch it

---

## Layer 3 — `models/[model]/policy.ts` — Policies

A policy class answers one question per action: "is this user allowed to do this to this resource?" Nothing else.

```ts
// models/agent/policy.ts
import type { User } from "@/lib/db/schema"
import type { AgentWithSubagents } from "@/lib/queries/agents"

export class AgentPolicy {
  constructor(private user: User) {}

  /**
   * Admin bypass — return `true` to allow all actions unconditionally.
   * Return `undefined` to proceed to per-action checks.
   */
  before(user: User): boolean | undefined {
    if (user.role === "admin") return true
    return undefined
  }

  view(agent: AgentWithSubagents): boolean {
    return agent.userId === this.user.id || agent.isPublic
  }

  create(user: PolicyUser): boolean {
    // Only non-client org members may create agents.
    // orgRole is resolved by withAuth and injected into PolicyUser.
    return user.orgRole !== "org-client"
  }

  edit(agent: AgentWithSubagents): boolean {
    return agent.userId === this.user.id
  }

  delete(agent: AgentWithSubagents): boolean {
    return agent.userId === this.user.id
  }
}
```

Rules:
- One policy class per model, located at `models/[model]/policy.ts`
- Policy methods return `boolean` — no side effects, no DB calls, no throws
- `before()` is the admin bypass — return `true` to allow everything, `undefined` to continue to per-action checks
- Method names match the action string passed to `authorize()`: `view`, `create`, `edit`, `delete`
- Never throw inside a policy — return `false` to deny; the bouncer converts that to `AuthorizationError`
- Policy methods are synchronous where possible; `async` is allowed only when a computed permission genuinely requires it (rare)

### Defense in depth — `return true` is forbidden

**`return true` unconditionally in a policy method is a policy violation.**

A bare `return true` means "I'm trusting another layer to enforce this." That is not defense in depth — it is a single point of failure. If the other layer is bypassed, misconfigured, or removed, the policy offers zero protection.

```ts
// ❌ Forbidden — the policy is not doing its job
create(_user: PolicyUser): boolean {
  return true // "route layer handles org-client restriction"
}
```

The policy layer is the **primary** authorization gate. Other layers (role middleware, route-level checks) are secondary reinforcement. The policy must enforce everything it has the information to enforce, independently of what any other layer does.

**If you need additional context to make the decision, expand `PolicyUser` — do not skip the check.**

For example, if `create` must be restricted to non-client org roles, and that role comes from the platform API at request time, resolve it in `withAuth` and inject it into the user context:

```ts
// app/api/_middleware.ts
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, ctx: RouteContext) => {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return unauthorized()

    // Resolve additional context needed by policies
    const orgRole = await resolveOrgRole(session.user.id) // platform API call

    const enrichedUser = { ...session.user, orgRole }

    try {
      return await handler(req, enrichedUser, bouncer(enrichedUser), ctx)
    } catch (e) {
      if (e instanceof AuthorizationError) return forbidden()
      throw e
    }
  }
}
```

Then the policy can enforce it:

```ts
// ✅ Correct — policy enforces the constraint itself
create(user: PolicyUser): boolean {
  return user.orgRole !== "org-client"
}
```

**The rule**: if a policy method cannot make a meaningful authorization decision with the information available, the fix is always to make more information available — never to return `true` and delegate to another layer.

---

## Layer 4 — `models/[model]/service.ts` — Services

Services own all business logic: multi-step operations, external calls, coordinating queries from multiple models. They are called by route handlers only.

```ts
// models/agent/service.ts
import { db } from "@/lib/db"
import { agents, agentSubagents } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { createWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/platform/client"
import { buildAgentWorkflow } from "@/lib/platform/workflows"
import { loadEnabledMcpConfigs } from "@/lib/mcps"
import { resolveAccessToken } from "@/lib/auth-helpers"
import type { CreateAgentInput, UpdateAgentInput } from "@/app/api/_validators"
import type { AgentWithSubagents } from "@/lib/queries/agents"

export class AgentService {
  static async create(
    userId: string,
    body: CreateAgentInput,
  ): Promise<AgentWithSubagents> {
    const mcpConfigs = await loadEnabledMcpConfigs(userId)
    const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
      { name: body.name, systemPrompt: body.systemPrompt, steps: body.steps, model: body.model, subagents: body.subagents },
      mcpConfigs,
    )
    const token = await resolveAccessToken(userId)
    const workflow = await createWorkflow(
      { name: `LDS Agent: ${body.name}`, slug: `lds-agent-${crypto.randomUUID()}`, isPublic: false, type: "streaming", nodes, edges },
      token,
    )
    const agentId = crypto.randomUUID()
    const now = new Date()
    await db.insert(agents).values({ id: agentId, userId, workflowId: workflow.id, name: body.name, systemPrompt: body.systemPrompt, steps: JSON.stringify(body.steps), model: body.model, createdAt: now, updatedAt: now })
    // ... persist subagents ...
    const created = await db.query.agents.findFirst({ where: and(eq(agents.id, agentId), eq(agents.userId, userId)), with: { subagents: true } })
    if (!created) throw new Error("Agent not found after insert")
    return created as AgentWithSubagents
  }

  static async update(
    agent: AgentWithSubagents,
    userId: string,
    body: UpdateAgentInput,
  ): Promise<AgentWithSubagents> {
    if (!agent.workflowId) throw new Error("Agent has no linked workflow")
    const mcpConfigs = await loadEnabledMcpConfigs(userId)
    const { nodes, edges, subagentNodeIds } = buildAgentWorkflow(
      { name: body.name, systemPrompt: body.systemPrompt, steps: body.steps, model: body.model, subagents: body.subagents },
      mcpConfigs,
    )
    const token = await resolveAccessToken(userId)
    await updateWorkflow(agent.workflowId, { nodes, edges, name: `LDS Agent: ${body.name}` }, token)
    const now = new Date()
    await db.update(agents).set({ name: body.name, systemPrompt: body.systemPrompt, steps: JSON.stringify(body.steps), model: body.model, updatedAt: now }).where(and(eq(agents.id, agent.id), eq(agents.userId, userId)))
    // ... replace subagents ...
    const updated = await db.query.agents.findFirst({ where: and(eq(agents.id, agent.id), eq(agents.userId, userId)), with: { subagents: true } })
    if (!updated) throw new Error("Agent not found after update")
    return updated as AgentWithSubagents
  }

  static async delete(agent: AgentWithSubagents, userId: string): Promise<void> {
    if (agent.workflowId) {
      const token = await resolveAccessToken(userId)
      await deleteWorkflow(agent.workflowId, token)
    }
    await db.delete(agents).where(and(eq(agents.id, agent.id), eq(agents.userId, userId)))
  }
}
```

Rules:
- Services are called from route handlers only — never from client components, pages, or other services in a cycle
- Services throw typed errors (not `Response` objects) — `withAuth` or the route handler catches and maps them
- Services may call: queries from `lib/queries/`, clients from `lib/platform/`, other services when non-cyclic
- Services never import from `app/` or `components/`
- Services are the only place that calls `lib/platform/client.ts` — route handlers never call platform clients directly
- Services operate on already-loaded resources passed in by the route handler — they do not re-fetch what the handler already loaded for the policy check

---

## The resulting route handler

### Before — current state

Every route handler in the codebase today contains inline auth checks, inline ownership guards, inline platform calls, and inline DB operations. A typical handler runs 40-80 lines:

```ts
// ❌ Current: app/api/agents/[id]/route.ts (DELETE) — before layering
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()

  const { id } = await context.params

  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
  })

  if (!existing) return notFound("Agent not found")

  if (existing.workflowId) {
    const token = await resolveAccessToken(session.user.id)
    await deleteWorkflow(existing.workflowId, token)
  }

  await db.delete(agents).where(and(eq(agents.id, id), eq(agents.userId, session.user.id)))

  return new Response(null, { status: 204 })
}
```

The ownership check (`eq(a.userId, session.user.id)`) is an authorization decision baked into the DB query. The platform call (`deleteWorkflow`) is business logic in the route handler. Both are invisible to any future policy change and untestable in isolation.

### After — layered

```ts
// ✅ Target: app/api/agents/[id]/route.ts (DELETE) — with layers
export const DELETE = withAuth(async (req, user, bouncer) => {
  const { id } = await params
  const agent = await AgentQueries.get(id)        // load without ownership filter
  if (!agent) return notFound()
  await bouncer.with(AgentPolicy).authorize("delete", agent)  // policy decides
  await AgentService.delete(agent, user.id)        // service does the work
  return new Response(null, { status: 204 })
})
```

The handler is 5 lines. Auth, authorization, and business logic are each in exactly one place.

### Complete before/after — PUT handler

```ts
// ❌ Before: 70+ lines, auth + ownership + platform call + DB writes inline
export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return unauthorized()
  const { id } = await context.params
  const existing = await db.query.agents.findFirst({
    where: (a, { eq, and }) => and(eq(a.id, id), eq(a.userId, session.user.id)),
    with: { subagents: true },
  })
  if (!existing) return notFound("Agent not found")
  const parsed = await parseBody(request, updateAgentBodySchema)
  if (parsed instanceof Response) return parsed
  const body = parsed
  // ... 40 more lines of mcpConfigs, buildAgentWorkflow, updateWorkflow,
  //     db.update, db.delete, db.insert, db.findFirst ...
  return ok<AgentResponse>(updated)
}

// ✅ After: 10 lines
export const PUT = withAuth(async (req, user, bouncer) => {
  const { id } = await params
  const parsed = await parseBody(req, updateAgentBodySchema)
  if (parsed instanceof Response) return parsed
  const agent = await AgentQueries.get(id)
  if (!agent) return notFound()
  await bouncer.with(AgentPolicy).authorize("edit", agent)
  const updated = await AgentService.update(agent, user.id, parsed)
  return ok<AgentResponse>({ ...updated, starterPrompts: updated.starterPrompts ? JSON.parse(updated.starterPrompts) : [] })
})
```

---

## Forbidden Patterns

```ts
// ❌ Inline session check — the only way to get user is through withAuth
const session = await auth.api.getSession({ headers: request.headers })
if (!session) return unauthorized()

// ❌ Inline ownership guard — authorization belongs in a Policy
if (agent.userId !== user.id) return forbidden()

// ❌ Ownership baked into the DB query — the policy can't see this, tests can't override it
const agent = await db.query.agents.findFirst({
  where: and(eq(agents.id, id), eq(agents.userId, session.user.id)),
})

// ❌ Platform client called from a route handler directly
const token = await resolveAccessToken(session.user.id)
await deleteWorkflow(agent.workflowId, token)

// ❌ Business logic (workflow rebuild, subagent deletion) in a route handler
const { nodes, edges } = buildAgentWorkflow({ ... }, mcpConfigs)
await updateWorkflow(agent.workflowId, { nodes, edges }, token)
await db.delete(agentSubagents).where(eq(agentSubagents.agentId, id))

// ❌ Policy method that makes a DB call
class AgentPolicy {
  async edit(agent: AgentWithSubagents): Promise<boolean> {
    const subscription = await db.query.subscriptions.findFirst(...)  // NO
    return agent.userId === this.user.id && subscription?.active
  }
}

// ❌ Service that returns a Response object
class AgentService {
  static async delete(id: string): Promise<Response> {  // NO
    await db.delete(agents).where(eq(agents.id, id))
    return new Response(null, { status: 204 })
  }
}
```

---

## Relation to Other Rules

- `parseBody` remains the validation gate as described in `api-routes.md` — it runs in the route handler before the policy check, because you need a typed body to pass to the service
- Query functions from `lib/queries/[model].ts` described in `hooks.md` are the right way to load resources before policy checks — the handler passes the loaded resource to `authorize`, not a raw ID
- Response helpers (`ok`, `notFound`, `unauthorized`, `forbidden`) from `lib/api-response.ts` are used only in route handlers — services never return `Response` objects
- The `withAuth` exemption for `/api/chat` is documented in `app/api/chat/route.ts` — streaming responses own their own response stream and cannot delegate it to a wrapper
