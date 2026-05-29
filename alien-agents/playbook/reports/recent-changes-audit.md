# Recent Changes Audit Report

**Date**: 2026-05-11
**Scope**: Unstaged changes across 15 files
**Auditor**: automated playbook review

---

## Summary

| File | Status |
|---|---|
| `app/api/chat/route.ts` | FAIL — prisma-shapes (inline include), api-layers (inline DB in route) |
| `lib/platform/responses_stream.ts` | PASS |
| `components/ai-elements/conversation.tsx` | PASS |
| `app/api/datasets/[id]/status/route.ts` | PASS |
| `components/app-sidebar.tsx` | PASS |
| `models/agents/service.ts` | PASS |
| `app/api/agents/[id]/route.ts` | PASS |
| `components/dialogs/datasets/attach-agent.tsx` | PASS |
| `app/[locale]/(app)/mcps/client.tsx` | FAIL — client-patterns (missing useEffect sync for useState(initialMcps)) |
| `app/[locale]/(app)/datasets/[id]/client.tsx` | FAIL — constants (10_000 magic number), page-structure (raw div panels), hooks (inline useEffect+apiFetch) |
| `components/dialogs/agents/attach-dataset.tsx` | PASS |
| `components/wizards/agents/start/steps/knowledge.tsx` | FAIL — hooks (inline useEffect+apiFetch) |
| `app/[locale]/(app)/specialists/client.tsx` | PASS |
| `app/[locale]/(app)/agents/client.tsx` | PASS |
| `components/selects/model/picker.tsx` | PASS |

**3 files PASS outright, 4 files have violations. Total violations: 6.**

---

## Detailed Findings

---

### `app/api/chat/route.ts`

**Rules checked**: api-layers, api-routes, prisma-shapes, models

#### FAIL — prisma-shapes: inline `include` in route handler (line 74–80)

```ts
const agent = await prisma.agent.findFirst({
  where: {
    id: body.agentId,
    OR: [{ userId: session.user.id }, { isPublic: true }],
  },
  include: { subagents: true },   // ← inline include
})
```

`models/agents/schema.ts` already defines and exports `agentWithSubagents` (`satisfies Prisma.AgentDefaultArgs`). The route must spread that shape instead of redeclaring `include` inline:

```ts
import { agentWithSubagents } from "@/models/agents/schema"

const agent = await prisma.agent.findFirst({
  where: { id: body.agentId, OR: [{ userId: session.user.id }, { isPublic: true }] },
  ...agentWithSubagents,
})
```

#### FAIL — api-layers: inline DB calls in route handler (lines 90–115, 117–124)

The `/api/chat` route is explicitly exempt from `withAuth` (streaming routes own their response stream), but the api-layers rule still applies to the DB operation boundary: `prisma.conversation.findFirst`, `prisma.conversation.create`, and `prisma.message.create` are all called directly in the route handler. These belong in a service or query function, not in the route body. A `ConversationService.ensureConversation()` and `MessageService.persistUser()` would push this logic to the correct layer. The persistence path in `persistAssistantMessage` has the same issue — direct Prisma calls outside the model layer.

This is a pre-existing structural issue in the chat route (acknowledged in CLAUDE.md as a streaming-exempt pattern), not introduced by this change. The new `onFinish`-based persistence wiring is architecturally sound. Recording the violation for completeness; consider a follow-up task.

---

### `lib/platform/responses_stream.ts`

**Rules checked**: all applicable

**PASS.** The `TASK_DISPATCH_RE` filter for `Task()` dispatch strings is correctly implemented as a named constant at module level (not a magic regex literal). No hardcoded strings, no forbidden patterns found.

---

### `components/ai-elements/conversation.tsx`

**Rules checked**: componentization, page-structure, i18n, new-primitives

**PASS.** The `initial="instant"` scroll fix is a prop change with no playbook implications. The component contains no user-visible hardcoded strings (all text content flows through props). No forbidden patterns found.

---

### `app/api/datasets/[id]/status/route.ts`

**Rules checked**: api-layers, api-routes, models, constants, prisma-shapes

**PASS.** The write-back of `DATASET_STATUS.Ready / .Error / .Processing` is correctly implemented:
- Uses `withAuth` → Policy (`DatasetPolicy.view`) → service/query layer
- Imports `ENTRY_STATUS` and `DATASET_STATUS` from `@/models/datasets/schema` — no magic strings
- `updateDatasetStatus` is called as a query/service function, not inline Prisma
- Response typed with `ok<DatasetStatusResponse>`

---

### `components/app-sidebar.tsx`

**Rules checked**: componentization, i18n, constants, page-structure, client-patterns

**PASS.** The Image `style={{ width: "auto" }}` aspect-ratio fix is a one-line change with no playbook implications. All navigation labels go through `useTranslations("nav")`. Route strings are defined inline (used only in this file — acceptable per constants rule until referenced from a second file). No forbidden patterns found.

---

### `models/agents/service.ts`

**Rules checked**: models, api-layers

**PASS.** `AgentWorkflowNotFoundError` is a properly typed error class exported from the service layer. It extends `Error`, sets `this.name`, and is thrown for a concrete 404 condition (not swallowed, not a catch-all). The service correctly re-throws the original error for non-404 cases (`throw err` on line 181). No `return true` in any policy method, no DB calls in policies, no Response objects returned from service.

---

### `app/api/agents/[id]/route.ts`

**Rules checked**: api-layers, api-routes, models

**PASS.** The `AgentWorkflowNotFoundError → 409` catch is correctly placed in the route handler (the only place that maps service errors to HTTP responses). The `err()` helper is used. The ownership check on line 20 is documented as a response-shape selector only (not an auth check), with a clear comment that `AgentPolicy.view()` has already been called. No forbidden patterns found.

---

### `components/dialogs/datasets/attach-agent.tsx`

**Rules checked**: client-patterns, hooks, componentization, i18n

**PASS.** The `useEffect([open])` pattern is correct per `client-patterns.md §2`: data loading (agent fetch) and cleanup (reset selection) are both in the effect, not in `onOpenChange`. The `res.ok` check on line 55 is present before `.json()`. Component is correctly extracted at `components/dialogs/datasets/attach-agent.tsx` with export name `DialogDatasetAttachAgent`. All strings via `useTranslations`.

---

### `app/[locale]/(app)/mcps/client.tsx`

**Rules checked**: client-patterns, hooks, i18n

#### FAIL — client-patterns §4: `useState(initialMcps)` without `useEffect` sync (line 23)

```ts
const [mcps, setMcps] = useState<McpRecord[]>(initialMcps)
```

This component performs local mutations (delete, toggle, create) so it legitimately needs `useState`. However, `client-patterns.md §4` requires a `useEffect([initialMcps])` sync whenever `router.refresh()` may be called by a child component (e.g. `PublishCardAction`, `DeleteCardAction`). Without the sync, `router.refresh()` re-fetches the server data but the component never picks up the updated `initialMcps`.

**Required fix:**
```ts
const [mcps, setMcps] = useState<McpRecord[]>(initialMcps)

useEffect(() => {
  setMcps(initialMcps)
}, [initialMcps])
```

The `isOwn` preservation in `handleToggle` and `handleTogglePublic` (lines 59, 77) is **correct** per `client-patterns.md §1` — the spread `{ ...updated, isOwn: m.isOwn }` preserves the client-side field. This is a well-implemented fix.

---

### `app/[locale]/(app)/datasets/[id]/client.tsx`

**Rules checked**: constants, page-structure, hooks, client-patterns, ui-states, i18n

#### FAIL — constants: magic number `10_000` at line 170 despite `ENTRY_POLL_INTERVAL_MS` being imported

`ENTRY_POLL_INTERVAL_MS` is imported from `@/lib/constants` on line 16 but the `setTimeout` call on line 170 uses the literal `10_000` directly:

```ts
pollingRef.current = setTimeout(() => fetchEntries(), 10_000)  // ← must use ENTRY_POLL_INTERVAL_MS
```

This is the exact anti-pattern described in `constants.md`. The constant exists for this purpose; use it.

#### FAIL — page-structure: raw `div` panels used as visual components (lines 325, 335, 353, 357)

Several `div`s carry structural styling that should use shadcn primitives:

- **Line 325** — `<div className="rounded-lg border overflow-hidden space-y-0">` wrapping skeleton rows: this is a card shape; the skeleton list should use `<Card>` anatomy.
- **Line 335** — `<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">` for the error state: this is an `Alert` / `AlertDestructive` (shadcn ships `<Alert variant="destructive">`).
- **Line 353** — `<div className="rounded-lg border border-dashed py-12 text-center">` for empty state: still a bordered panel, should use shadcn or be extracted as a named component.
- **Line 357** — `<div className="rounded-lg border overflow-hidden">` wrapping the file table: this is a card container.

Per `page-structure.md`: "if the div has a border, shadow, background, or rounded corners — it should be a shadcn primitive."

#### FAIL — hooks: inline `useEffect` + `apiFetch` in a client component (lines 157–176)

`hooks.md` states: "All data flows through two dedicated layers: server queries in `lib/queries/` and TanStack Query hooks in `hooks/api/`. No client component fetches data any other way." `hooks/api/datasets.ts` already exists. The entry-fetch and polling logic should be a custom hook or `useQuery` with a polling `refetchInterval`, not a manual `useEffect` + `apiFetch` + `pollingRef`.

This is a pre-existing pattern in this file (the entry polling predates this change set). The new changes do not introduce it, but they touch the file and the violation must be cited.

---

### `components/dialogs/agents/attach-dataset.tsx`

**Rules checked**: client-patterns, hooks, componentization, i18n

**PASS.** The `res.ok` check is correctly present on line 85 before `.json()`. `isOwn` is not applicable here (no list state managed in this component). The `handleOpenChange` reset pattern is correct — reset happens inside `handleOpenChange` on close, which is correct for this case because there is no programmatic open path that bypasses it. All strings via `useTranslations`. The unathorised `apiFetch` on line 93 (`await apiFetch(\`/api/datasets/${selectedDatasetId}\`)`) has no `res.ok` check and its result is discarded — this is a fire-and-forget refresh call and not a read, so it is acceptable, though a comment would help.

---

### `components/wizards/agents/start/steps/knowledge.tsx`

**Rules checked**: hooks, ui-states, constants, i18n

#### FAIL — hooks: inline `useEffect` + `apiFetch` in a client component (lines 45–67)

Same category as the datasets detail client. `hooks.md` forbids `useState` + `useEffect` + `apiFetch` in component bodies — data must go through TanStack Query hooks. `hooks/api/datasets.ts` exists. The dataset list load should use `useDatasets()` (or a hook with `enabled: state.knowledgeMode === "existing"`).

The error handling has `toast.error` but also swallows the array into `[]` on error (line 56: `setDatasets([])`). This means a network failure renders "no datasets" instead of an error state, which `ui-states.md` forbids. The `res.ok` throw on line 52 is present but the catch silently degrades to an empty list. The catch should `toast.error` only — do not assign `setDatasets([])` in the catch.

---

### `app/[locale]/(app)/specialists/client.tsx`

**Rules checked**: client-patterns, page-client-split, hooks, i18n

**PASS.** The `useState` wrapper has been removed — `initialSpecialists` is used directly as a prop. No local mutations exist in this component, so the prop-direct pattern is correct per `client-patterns.md §4`. All text through `useTranslations`.

---

### `app/[locale]/(app)/agents/client.tsx`

**Rules checked**: client-patterns, page-client-split, hooks, i18n

**PASS.** Same as specialists — `useState` wrapper removed, `initialAgents` used directly. No local mutations. Correct per `client-patterns.md §4`.

---

### `components/selects/model/picker.tsx`

**Rules checked**: componentization, new-primitives, constants

**PASS.** The `Array.from(new Map(...).values())` dedup-by-slug is a correct in-place fix with no playbook implications. The component is correctly extracted as `SelectModelPicker` under `components/selects/model/`. No magic strings, no forbidden primitives.

---

## Violations Summary

| # | File | Rule | Line(s) | Severity |
|---|---|---|---|---|
| 1 | `app/api/chat/route.ts` | prisma-shapes — inline `include` | 79 | Medium |
| 2 | `app/api/chat/route.ts` | api-layers — inline DB in route handler | 74–124 | Low (streaming-exempt pre-existing) |
| 3 | `app/[locale]/(app)/mcps/client.tsx` | client-patterns §4 — missing useEffect sync | 23 | Medium |
| 4 | `app/[locale]/(app)/datasets/[id]/client.tsx` | constants — `10_000` magic number | 170 | Low |
| 5 | `app/[locale]/(app)/datasets/[id]/client.tsx` | page-structure — raw div panels | 325, 335, 353, 357 | Medium |
| 6 | `app/[locale]/(app)/datasets/[id]/client.tsx` | hooks — inline useEffect+apiFetch | 157–176 | Medium (pre-existing) |
| 7 | `components/wizards/agents/start/steps/knowledge.tsx` | hooks — inline useEffect+apiFetch | 45–67 | Medium (pre-existing) |
| 8 | `components/wizards/agents/start/steps/knowledge.tsx` | ui-states — error degrades to empty state | 56–59 | High |

**Must-fix before merge**: violations 1, 3, 4, 8.
**Pre-existing (track separately)**: violations 2, 6, 7.
**Refactor backlog**: violation 5.
