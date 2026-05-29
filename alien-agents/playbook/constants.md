# Constants and Enums Rule

## Rule

No magic strings or magic numbers inline in JSX or application logic. Every domain value that names a state, type, role, or configuration parameter is a named constant or enum. Repetition is the smell — if the same string appears in two files, it belongs in a constant.

---

## Where Constants Live

### Domain values (status, type, role) → `lib/db/schema.ts` or `lib/models/[model].ts`

Status values, entity types, and roles that describe what a model can be are defined next to the schema that uses them. They are not scattered across components or API routes.

```ts
// lib/db/schema.ts

// ✅ Status values live next to the table they describe
export const DATASET_STATUS = {
  Pending: "pending",
  Processing: "processing",
  Ready: "ready",
  Error: "error",
} as const

export type DatasetStatus = (typeof DATASET_STATUS)[keyof typeof DATASET_STATUS]

export const datasets = pgTable("datasets", {
  // ...
  status: text("status").default(DATASET_STATUS.Pending),
})
```

Both the API route that writes status and the UI component that displays it import from the same source. No string appears in two places.

```ts
// app/api/datasets/[id]/status/route.ts
import { DATASET_STATUS } from "@/lib/db/schema"

if (clusterEntry.status === "processed") {
  await db.update(datasets)
    .set({ status: DATASET_STATUS.Ready })
    .where(eq(datasets.id, datasetId))
}
```

```tsx
// components/cards/datasets/row.tsx
import { DATASET_STATUS, type DatasetStatus } from "@/lib/db/schema"

const badgeVariant = {
  [DATASET_STATUS.Pending]: "secondary",
  [DATASET_STATUS.Processing]: "outline",
  [DATASET_STATUS.Ready]: "success",
  [DATASET_STATUS.Error]: "destructive",
} satisfies Record<DatasetStatus, string>
```

### App-wide configuration values → `lib/constants.ts`

Strings and numbers used across multiple features (default model slugs, header names, transport types, pipeline presets) live in `lib/constants.ts`. This file already exists — add to it rather than creating new scattered constant files.

```ts
// lib/constants.ts
export const DEFAULT_MODEL_SLUG = "mistral-medium-3.5"
export const DEFAULT_MCP_TRANSPORT = "streamable_http"
export const DEFAULT_DATASET_PIPELINE_PRESET = "general_purpose"
export const PLATFORM_OAUTH_TOKEN_HEADER = "x-oauth-access-token"
```

### Route paths reused across multiple files → `lib/constants.ts`

If a route string appears in more than one file, it moves to `lib/constants.ts`.

```ts
// lib/constants.ts
export const ROUTES = {
  agents: "/agents",
  agentNew: "/agents/new",
  agentDetail: (id: string) => `/agents/${id}`,
  agentChat: (agentId: string) => `/agents/${agentId}/chat`,
  datasets: "/datasets",
  specialists: "/specialists",
  mcps: "/mcps",
} as const
```

```tsx
// ✅ Link uses the constant
import { ROUTES } from "@/lib/constants"
<Link href={ROUTES.agentNew}>{t("createButton")}</Link>

// ❌ Hardcoded in JSX
<Link href="/agents/new">{t("createButton")}</Link>
```

### API endpoint paths used by a single hook or route → top of that file

If an API path is only referenced in one file, define it as a constant at the top of that file. It does not need to move to `lib/constants.ts` until it is referenced from a second location.

```ts
// components/hooks/use-agents.ts
const AGENTS_ENDPOINT = "/api/agents"

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiFetch(AGENTS_ENDPOINT).then((r) => r.json()),
  })
}
```

### Magic numbers → named constants wherever they appear

Timeouts, poll intervals, pagination sizes, retry limits — any number whose meaning is not self-evident from context gets a name.

```ts
// ✅ Named — the intent is clear
const DATASET_POLL_INTERVAL_MS = 10_000
const MAX_FILE_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
const CONVERSATION_PAGE_SIZE = 20

// ❌ Unnamed — what does 10000 mean here?
setInterval(pollStatus, 10000)
```

---

## Anti-Patterns (FORBIDDEN)

```tsx
// ❌ Inline status comparison with a string literal
if (dataset.status === "processing") { ... }
// Use: if (dataset.status === DATASET_STATUS.Processing) { ... }

// ❌ Same route string in 3 different files
// agents/page.tsx:    <Link href="/agents/new">
// app-sidebar.tsx:    href="/agents/new"
// wizard/done.tsx:    router.push("/agents/new")
// Use: ROUTES.agentNew

// ❌ Magic number inline
setTimeout(refetch, 10000)
// Use: setTimeout(refetch, DATASET_POLL_INTERVAL_MS)

// ❌ Magic number for pagination with no name
const items = data.slice(0, 20)
// Use: const items = data.slice(0, CONVERSATION_PAGE_SIZE)

// ❌ Status value defined in a component, not the schema file
// components/cards/datasets/row.tsx:
const STATUS_LABELS = { pending: "Pending", processing: "Processing", ... }
// These belong in lib/db/schema.ts next to the table definition
```

---

## Scope

This rule covers all files under:

- `app/` (pages, API routes, layouts)
- `components/` (all components)
- `lib/` (hooks, utilities, platform client)

The rule does not apply to generated migration files in `drizzle/` or to test fixtures.
