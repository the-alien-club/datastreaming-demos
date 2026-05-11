# UI States Rule

## Rule

Every component that receives async data must handle three states explicitly: **loading**, **empty**, and **error**. No exceptions.

Each state is a distinct JSX branch — not a ternary chain that collapses two states into one and silently drops the third.

---

## The Three States

### Loading

Use the shadcn `Skeleton` component. No spinners in content areas, no "Loading…" text where content will eventually appear.

Skeletons mirror the shape of the content they replace. A list of cards gets skeleton cards. A detail header gets a skeleton header. The skeleton should look like the content at rest, just grey.

```tsx
import { Skeleton } from "@/components/ui/skeleton"

function AgentCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}
```

### Empty

A meaningful empty state: at minimum a message explaining why there is nothing to show. Where applicable, include a call-to-action so the user knows what to do next. Never render nothing — an empty `<div />` or a bare `null` is not an empty state.

```tsx
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

function AgentsEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
      <p className="text-sm">{t("noAgents")}</p>
      <Button size="sm" onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        {t("createFirst")}
      </Button>
    </div>
  )
}
```

### Error

A visible error message the user can act on. Never silently swallow an error and render an empty list — the user cannot tell whether no data exists or whether something broke.

```tsx
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

function AgentsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-destructive">
      <AlertCircle className="h-6 w-6" />
      <p className="text-sm">{tCommon("error")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {tCommon("tryAgain")}
      </Button>
    </div>
  )
}
```

---

## Pattern: TanStack Query

When using TanStack Query, the three flags map directly to the three branches. Write them as explicit `if` blocks, not a ternary pyramid.

```tsx
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"

export function AgentList() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiFetch("/api/agents").then((r) => r.json()),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (isError) {
    return <AgentsError onRetry={refetch} />
  }

  if (!data || data.length === 0) {
    return <AgentsEmpty onCreateClick={...} />
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((agent) => (
        <CardAgentSummary key={agent.id} agent={agent} />
      ))}
    </div>
  )
}
```

The same pattern applies to client-side `useState` + `useEffect` data fetching — maintain separate `loading` and `error` state booleans and branch on them in the same explicit order.

---

## Anti-Patterns (FORBIDDEN)

```tsx
// ❌ No loading state — user sees nothing while data loads
{data && data.map((a) => <CardAgentSummary key={a.id} agent={a} />)}

// ❌ Spinner in a content area — layout jumps when content loads
{isLoading ? <Loader2 className="animate-spin" /> : <Content />}

// ❌ Error silently renders as empty list — indistinguishable from real empty state
.catch(() => setAgents([]))

// ❌ Ternary chain that collapses error and empty into one branch
{isLoading ? <Skeleton /> : data?.length ? <List /> : <Empty />}
// (error is swallowed; the user sees "no items" even when the request failed)

// ❌ Rendering nothing for the empty state
if (data.length === 0) return null
```

---

## Scope

This rule applies to every component that loads async data, regardless of how it loads it:

- TanStack Query hooks (`useQuery`)
- `useState` + `useEffect` + `apiFetch`
- SWR or any other data-fetching hook

The three state components (`*Skeleton`, `*Empty`, `*Error`) may be inlined in the same file for small components or extracted to named files under `components/` when reused.
