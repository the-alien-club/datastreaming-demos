# Client Patterns Rule

## Rule

Client-side state management, dialog data loading, and API error handling each have one correct form. Deviating from any of them produces silent failures that are indistinguishable from empty states, missing UI fields, or successful no-ops.

---

## 1. Preserve Client-Side Enriched Fields on Mutation Update

When a mutation response replaces a record in local state, any field that was added client-side (not returned by the API) is silently lost. The API response is a partial view of the record — it does not know about fields the client computed or decorated.

Common client-side fields: `isOwn`, `isPublic` when computed client-side, display flags, UI-only state added after the initial fetch.

**Forbidden:**
```ts
// API response doesn't include isOwn — it gets clobbered silently
setMcps(prev => prev.map(m => m.id === updated.id ? updated : m))
```

**Correct:**
```ts
// Spread updated over existing record to preserve client-side fields
setMcps(prev => prev.map(m =>
  m.id === updated.id ? { ...updated, isOwn: m.isOwn } : m
))
```

### How to identify which fields to preserve

For every local state type, determine the source of each field:

- Fields that come from the API response: replace freely with the mutation result
- Fields computed after the fetch (e.g. `isOwn: row.userId === session.user.id`): preserve from the existing record
- Fields set by UI interaction (e.g. `isExpanded`, `isDraft`): preserve from the existing record

Write the spread as `{ ...updated, ...clientFields }` — never replace with a bare API response object.

### When this does not apply

Components migrated to TanStack Query mutations do not hit this problem: `onSuccess` calls `invalidateQueries`, the list re-fetches from the server, and the server query re-attaches client-side fields (e.g. `isOwn`) before the data reaches the component. This rule applies to components still using manual `useState` + `apiFetch` state management.

---

## 2. Never Use `onOpenChange` to Trigger Data Fetching in Controlled Dialogs

Radix UI `onOpenChange` fires only for **user-initiated** state transitions: Escape key, overlay click, close button. When a parent component programmatically opens a dialog by setting `open={true}`, `onOpenChange` is **not** called with `true`. Any data fetch placed inside `onOpenChange` will silently not run on programmatic open.

**Forbidden:**
```ts
// Silently never fires when parent sets open={true} programmatically
async function handleOpenChange(next: boolean) {
  onOpenChange(next)
  if (next && !loaded) {
    const data = await fetch("/api/things")
    setThings(data)
    setLoaded(true)
  }
}

<Dialog open={open} onOpenChange={handleOpenChange}>
```

**Correct:**
```ts
// Fires reliably whenever open changes, regardless of who changed it
useEffect(() => {
  if (!open) {
    setSelection("")
    setItems([])
    return
  }
  async function load() {
    const res = await apiFetch("/api/things")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setItems(await res.json())
  }
  load().catch(() => toast.error(t("failedLoad")))
}, [open])

<Dialog open={open} onOpenChange={onOpenChange}>
```

### The split of responsibility

- `useEffect([open])`: owns all data loading and reset logic keyed on dialog visibility
- `onOpenChange`: propagates close events back to the parent — nothing else

`onOpenChange` is a one-way signal from Radix to the parent. It is not an event hook for side effects. Side effects belong in `useEffect`.

### Cleanup on close

The `open === false` branch of the effect is the correct place to reset transient dialog state (selected item, search text, fetched list). Resetting in `onOpenChange` misses programmatic closes (parent sets `open={false}` directly).

---

## 3. Always Check `res.ok` Before Parsing API Responses

Without a `res.ok` check, a 401 or 500 response body is passed to `.json()` and parsed as data. An `{ error: "Unauthorized" }` object is not an array — `Array.isArray(data)` is false, `setItems([])` runs silently, and the user sees an empty list with no error message. The error state defined in `ui-states.md` never renders.

**Forbidden:**
```ts
const res = await apiFetch("/api/agents")
const data = await res.json()
// Silent failure: 401 body parses as object, treated as "no agents"
setAgents(Array.isArray(data) ? data : [])
```

**Correct:**
```ts
const res = await apiFetch("/api/agents")
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const data = await res.json()
setAgents(data)
```

### Where the check must go

The `res.ok` check must appear immediately after the `apiFetch` call, before any `.json()` call or data assignment. Every `apiFetch` call requires it — there are no exemptions for "internal" or "unlikely to fail" routes.

### How errors surface to the user

The throw propagates to the surrounding `try/catch` or to the `.catch()` on the promise:

```ts
async function load() {
  const res = await apiFetch("/api/agents")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  setAgents(await res.json())
}
load().catch(() => toast.error(t("failedLoadAgents")))
```

Never catch the error and swallow it. Log and surface, or surface alone — never surface nothing.

### `Array.isArray` is not error handling

`Array.isArray(data) ? data : []` is a type narrowing guard for well-formed responses. It is not a substitute for checking `res.ok`. An error response that happens to be an array (rare but possible) would pass through silently. A non-array success response (e.g. a paginated wrapper object) would be treated as empty. The guard and the `res.ok` check are solving different problems — do not conflate them.

---

## 4. Never Wrap Server-Passed Props in `useState` When Using `router.refresh()`

When a client component wraps a server-passed prop in `useState`, React initialises state **once on mount** and ignores all subsequent prop updates — including those triggered by `router.refresh()`. The server re-fetches and passes fresh data, but the component never sees it.

**Forbidden:**
```tsx
// router.refresh() updates initialAgents on the server — but this component
// never receives the update because useState ignores prop changes after mount
export function AgentsClient({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents] = useState(initialAgents) // ← frozen after first render

  return <LayoutAgentsGrid agents={agents} />
}
```

**Correct — no local mutations needed:**
```tsx
// Use the prop directly — router.refresh() now works as expected
export function AgentsClient({ initialAgents }: { initialAgents: Agent[] }) {
  return <LayoutAgentsGrid agents={initialAgents} />
}
```

**Correct — local mutations needed (e.g. optimistic delete):**
```tsx
// Keep useState but sync it when the prop changes
export function AgentsClient({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents)

  useEffect(() => {
    setAgents(initialAgents)
  }, [initialAgents])

  function handleDelete(id: string) {
    setAgents(prev => prev.filter(a => a.id !== id))
    // ... API call
  }

  return <LayoutAgentsGrid agents={agents} />
}
```

**Decision rule:**
- No local mutations to the list → drop `useState`, use prop directly
- Local mutations needed (optimistic updates, inline edits) → keep `useState` + add `useEffect([initialProp])` to stay in sync with server refreshes

**Where `router.refresh()` is used:**
`PublishCardAction` and `DeleteCardAction` both call `router.refresh()` after a successful mutation. Any list component that renders these cards must follow this rule, or the UI will appear frozen after publish/delete/make-private actions.

---

## Forbidden Patterns (Summary)

```ts
// ❌ Bare API response replaces local record — client-side fields lost
setMcps(prev => prev.map(m => m.id === updated.id ? updated : m))

// ❌ Data fetch inside onOpenChange — silently skipped on programmatic open
async function handleOpenChange(next: boolean) {
  if (next) { const data = await apiFetch("/api/things"); ... }
}

// ❌ Array guard masking an HTTP error as an empty state
const data = await res.json()
setAgents(Array.isArray(data) ? data : [])

// ❌ res.ok check after .json() — too late, body already parsed
const data = await res.json()
if (!res.ok) throw new Error("failed")

// ❌ useState freezes prop — router.refresh() updates are silently ignored
const [agents] = useState(initialAgents)
```

---

## Relation to Other Rules

- **`ui-states.md`**: Rules 1 and 3 both produce the same visible symptom described in `ui-states.md`: an API failure silently renders as an empty state. `ui-states.md` defines what the error state must look like; this file defines how errors must be thrown so that state can be reached. A missing `res.ok` check and a `setItems([])` in a catch block are two different ways to end up in the same invisible failure mode.

- **`hooks.md`**: TanStack Query hooks handle `res.ok` and throw correctly by convention (see `hooks/api/agents.ts`), and `onSuccess` + `invalidateQueries` re-fetches the full record from the server — meaning client-side fields are re-attached in the query function rather than preserved manually. The patterns in this file are most relevant to components still using manual `useState` + `useEffect` + `apiFetch` data fetching, which exist in `mcps-view.tsx`, `datasets-view.tsx`, and `new-agent-form.tsx` ahead of full TanStack migration. New components must use TanStack Query hooks and will not need to apply Rules 1 or 3 directly.
