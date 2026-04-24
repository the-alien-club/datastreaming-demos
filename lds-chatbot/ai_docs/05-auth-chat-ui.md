# LDS Chatbot — Auth & Chat UI

## Authentication

### Stack

- **better-auth** v1.5.x — server + client
- **genericOAuth** plugin — connects to Authentik
- JWT session cookies with 24h TTL

### Server-Side Auth Instance

File: `lib/auth.ts`

```typescript
import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"

const authentikBaseUrl = process.env.NEXT_PUBLIC_AUTHENTIK_BASE_URL!
const appSlug = process.env.AUTHENTIK_APP_SLUG || "datastreaming"
const baseURL = process.env.BETTER_AUTH_URL!

export const auth = betterAuth({
  appName: "LDS Chatbot",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 86400, // 24h
      strategy: "jwt",
      refreshCache: true,
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${authentikBaseUrl}/application/o/${appSlug}/.well-known/openid-configuration`,
          redirectURI: `${baseURL}/api/auth/oauth2/callback/authentik`,
          scopes: ["openid", "email", "profile", "offline_access"],
          accessType: "offline",
          prompt: "consent",
        },
      ],
    }),
  ],
})
```

### Client-Side Auth

File: `lib/auth-client.ts`

```typescript
"use client"

import { createAuthClient } from "better-auth/react"
import { genericOAuthClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [genericOAuthClient()],
})
```

### Auth API Route

File: `app/api/auth/[...all]/route.ts`

```typescript
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth"

export const { GET, POST } = toNextJsHandler(auth)
```

### Token Extraction

In every API route that calls the platform backend:

```typescript
import { auth } from "@/lib/auth"

async function getAccessToken(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null

  const tokenResult = await auth.api.getAccessToken({
    headers: request.headers,
    body: { providerId: "authentik" },
  })
  return tokenResult?.accessToken || null
}
```

### Auth Guard

Middleware or per-route check in the `(app)` layout:

```typescript
// app/(app)/layout.tsx
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function AppLayout({ children }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")
  return <>{children}</>
}
```

## Chat UI

### Library Choice

Using **Vercel AI SDK** (`ai` + `@ai-sdk/react`):
- `useChat` hook handles message state, streaming, loading
- Works with a custom POST endpoint (`/api/chat`)
- Built-in streaming support with text stream protocol

### Chat Page

File: `app/(app)/agents/[id]/chat/page.tsx`

New conversation page. Creates a conversation record on first message.

```typescript
"use client"

import { useChat } from "@ai-sdk/react"
import { useRouter } from "next/navigation"

export default function ChatPage({ params }: { params: { id: string } }) {
  const agentId = params.id
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | null>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/chat",
    body: { agentId, conversationId },
    onFinish: (message) => {
      // After first response, we have a conversationId
      // Redirect to the conversation URL for bookmarkability
      if (conversationId) {
        router.replace(`/agents/${agentId}/chat/${conversationId}`)
      }
    },
  })

  return (
    <div className="flex flex-col h-full">
      <ChatHeader agentId={agentId} />
      <ChatMessages messages={messages} isLoading={isLoading} />
      <ChatInput
        input={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
```

### Existing Conversation Page

File: `app/(app)/agents/[id]/chat/[conversationId]/page.tsx`

Loads existing messages from local DB, continues the conversation.

```typescript
export default async function ConversationPage({ params }) {
  const { id: agentId, conversationId } = params

  // Server: load existing messages from local DB
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: { messages: true },
  })

  return <ChatClient
    agentId={agentId}
    conversationId={conversationId}
    initialMessages={conversation?.messages || []}
    sessionId={conversation?.sessionId || null}
  />
}
```

### Chat Components

**ChatMessages** — Renders message list with markdown support:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  You:                                                │
│  ┌──────────────────────────────────────────────┐    │
│  │ Can you check if ACME Corp falls under       │    │
│  │ the SYNTEC convention?                       │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Assistant:                                          │
│  ┌──────────────────────────────────────────────┐    │
│  │ I'll research that for you. Let me check     │    │
│  │ the company details and applicable           │    │
│  │ convention...                                │    │
│  │                                              │    │
│  │ Based on my research, ACME Corp (SIREN:      │    │
│  │ 123456789) with NAF code 6202A falls under   │    │
│  │ the CCN SYNTEC (IDCC 1486).                  │    │
│  │                                              │    │
│  │ **Classification**: Engineering consulting   │    │
│  │ **Applicable since**: Company registration   │    │
│  │                                              │    │
│  │        ⏱ 16.2s · 2005 tokens · $0.004       │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ Type a message...                     [Send] │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

**ChatInput** — Textarea with Shift+Enter for newline, Enter to send.

**MetadataBar** — Below each assistant message: execution time, token count, cost. Collapsed by default, expandable to show per-LLM-call breakdown.

### Conversations List

File: `app/(app)/conversations/page.tsx`

Lists all conversations across all agents, ordered by `updated_at` desc.

```
┌──────────────────────────────────────────────────────┐
│  Conversations                                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Today                                               │
│  ┌──────────────────────────────────────────────┐    │
│  │ SYNTEC Convention Check — Legal Assistant     │    │
│  │ 3 messages · 2 minutes ago                   │    │
│  ├──────────────────────────────────────────────┤    │
│  │ Contract Draft for Dev Position — Legal...   │    │
│  │ 8 messages · 1 hour ago                      │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Yesterday                                           │
│  ┌──────────────────────────────────────────────┐    │
│  │ Research on Stem Cells — BioRxiv Agent       │    │
│  │ 5 messages · yesterday                       │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Streaming Implementation Detail

### `/api/chat` Route

The Vercel AI SDK expects the route to return a streaming response in its text stream protocol. We bridge from our SSE backend:

```typescript
// app/api/chat/route.ts
import { streamText, createDataStream } from "ai"

export async function POST(req: Request) {
  const { messages, agentId, conversationId } = await req.json()
  const accessToken = await getAccessToken(req)
  if (!accessToken) return new Response("Unauthorized", { status: 401 })

  const agent = await getAgent(agentId)
  const conversation = conversationId ? await getConversation(conversationId) : null
  const lastMessage = messages[messages.length - 1].content

  // Save user message
  const convId = conversation?.id || crypto.randomUUID()
  if (!conversation) {
    await createConversation(convId, agentId, lastMessage)
  }
  await saveMessage(convId, "user", lastMessage)

  // Start async job
  const job = await runWorkflow(agent.workflowId, {
    user_prompt: lastMessage,
    session_id: conversation?.sessionId || "",
  }, accessToken)

  // Stream the response
  return createDataStream({
    execute: async (dataStream) => {
      let lastChunkIndex = 0

      for await (const event of streamJobSSE(job.id, accessToken)) {
        // Forward new agent chunks as text
        const chunks = event.result?.stream?.agent?.chunks || []
        for (let i = lastChunkIndex; i < chunks.length; i++) {
          const content = chunks[i].choices?.[0]?.delta?.content
          if (content) {
            dataStream.writeData(content)
          }
        }
        lastChunkIndex = chunks.length

        if (event.type === "done") {
          // Extract final result
          const result = extractResult(event.result)
          const sessionId = result.sessionId

          // Save assistant message
          await saveMessage(convId, "assistant", result.content, result.metadata)

          // Update conversation session_id
          if (sessionId) {
            await updateConversationSession(convId, sessionId)
          }
          break
        }
      }
    },
  }).toDataStreamResponse()
}
```

### SSE Consumer Utility

File: `lib/platform/client.ts`

```typescript
export async function* streamJobSSE(jobId: number, accessToken: string) {
  const response = await fetch(`${PLATFORM_API_URL}/jobs/${jobId}/stream`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop()! // Keep incomplete event in buffer

    for (const eventStr of events) {
      const dataLine = eventStr.split("\n").find(l => l.startsWith("data: "))
      if (!dataLine) continue
      const data = JSON.parse(dataLine.slice(6))
      yield data
    }
  }
}
```

## Sidebar Navigation

```
┌───────────────────┐
│  LDS Chatbot      │
│                   │
│  🤖 Agents        │
│  💬 Conversations │
│  📄 Datasets      │
│                   │
│  ─────────────    │
│  User Name        │
│  [Sign Out]       │
└───────────────────┘
```

## Package Dependencies

```json
{
  "ai": "^4.0.0",
  "@ai-sdk/react": "^1.0.0",
  "better-auth": "^1.5.0",
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0"
}
```
