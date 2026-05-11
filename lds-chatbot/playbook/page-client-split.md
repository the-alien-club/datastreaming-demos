# Page / Client Split Rule

## Rule

Every interactive route has exactly two files:

```
app/[locale]/(app)/feature/
├── page.tsx      ← server component: data loading only
└── client.tsx    ← client component: layout and interactivity
```

No other naming is acceptable. Not `feature-view.tsx`, not `new-feature-form.tsx`, not `existing-feature-client.tsx`. Always `page.tsx` and `client.tsx`.

---

## Responsibilities

### `page.tsx` — Server Component
- Never has `"use client"`
- Fetches all initial data (Drizzle queries, API calls, auth checks)
- Passes fetched data to `<FeatureClient>` as `initial*` props
- Contains no JSX beyond the client component and any server-only wrappers (metadata, suspense boundaries)

```tsx
// app/[locale]/(app)/agents/page.tsx
import { getAgents } from "@/lib/db/queries"
import { AgentsClient } from "./client"

export default async function AgentsPage() {
  const agents = await getAgents()
  return <AgentsClient initialAgents={agents} />
}
```

### `client.tsx` — Client Component
- Always starts with `"use client"`
- Receives `initial*` props from the server component — never fetches on mount for data the server already has
- Owns all interactivity: state, event handlers, dialogs, forms
- Renders the page layout using named components from `components/`

```tsx
// app/[locale]/(app)/agents/client.tsx
"use client"

import { CardAgentSummary } from "@/components/cards/agents/summary"
import { DialogAgentCreate } from "@/components/dialogs/agents/create"

type AgentsClientProps = {
  initialAgents: Agent[]
}

export function AgentsClient({ initialAgents }: AgentsClientProps) {
  const [agents, setAgents] = useState(initialAgents)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6 p-6">
      {agents.map(agent => (
        <CardAgentSummary key={agent.id} agent={agent} />
      ))}
      <DialogAgentCreate open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

---

## Naming the Client Export

The export name is the route feature name in PascalCase + `Client`:

| Route | Client export |
|---|---|
| `agents/` | `AgentsClient` |
| `agents/[id]/` | `AgentDetailClient` |
| `agents/[id]/chat/[conversationId]/` | `ConversationClient` |
| `datasets/` | `DatasetsClient` |
| `specialists/new/` | `SpecialistNewClient` |

---

## Props Convention

Server-fetched data passed to the client component is always prefixed with `initial`:

```tsx
type AgentDetailClientProps = {
  initialAgent: Agent
  initialSubagents: Subagent[]
  initialModels: PublicAIModel[]
}
```

The client may refetch or mutate this data after mount — but it starts from `initial*` rather than loading from scratch, preventing layout shift.

---

## What This Forbids

```
// ❌ Arbitrary client file names
agents/agents-view.tsx
agents/new/new-agent-form.tsx
agents/[id]/chat/[convId]/existing-chat-client.tsx
datasets/datasets-view.tsx

// ❌ Data fetching inside the client component
export function AgentsClient() {
  const [agents, setAgents] = useState([])
  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(setAgents)
  }, [])
  // ← server already has this data; don't throw it away
}

// ❌ Business logic in page.tsx
export default async function AgentsPage() {
  const agents = await getAgents()
  return (
    <div className="p-6">           {/* ← layout belongs in client */}
      {agents.map(a => <div>...</div>)}
    </div>
  )
}
```

---

## Static Pages (No Client Needed)

If a page has zero interactivity, `client.tsx` is not required. `page.tsx` renders the full output as a server component. This is the exception — most app pages need a client component.

---

## Relation to Other Rules

- The client component follows the **page-structure rule**: `div` for layout only, named components for content
- Named components used inside `client.tsx` follow the **componentization rule**: `components/[type]/[feature]/name.tsx`
- Forms inside dialogs/pages follow the **forms rule**: `components/forms/[feature]/name.tsx`
