# LDS Chatbot — OpenAI API Wrapper

## Purpose

Expose our workflow-based agent system as an OpenAI-compatible chat completion endpoint. This enables:
1. The built-in chat UI to use standard libraries (Vercel AI SDK)
2. External consumers (Postman, curl, other apps) to interact via the OpenAI protocol
3. Future integration with any tool that speaks OpenAI API

## Endpoints

### Internal: `POST /api/chat`

Used by the built-in Vercel AI SDK `useChat` hook. Accepts/returns Vercel AI text stream protocol.

### External: `POST /api/v1/agent/[id]/v1/chat/completions`

Full OpenAI-compatible endpoint. Accepts OpenAI chat completion request, returns OpenAI response (streaming or non-streaming).

Both endpoints share the same core logic in `lib/platform/chat-bridge.ts`.

## Request Flow

### Non-Streaming

```
Client                          Next.js API Route              Platform Backend
  │                                  │                              │
  │  POST /api/chat                  │                              │
  │  {messages, agentId}             │                              │
  │─────────────────────────────────>│                              │
  │                                  │  POST /workflows/{id}/run-sync
  │                                  │  {input: {                   │
  │                                  │    user_prompt: last_msg,    │
  │                                  │    session_id: session_id    │
  │                                  │  }}                          │
  │                                  │─────────────────────────────>│
  │                                  │                              │ Worker executes
  │                                  │                              │ deep agent
  │                                  │  {data: {result: {           │
  │                                  │    results: {...}            │
  │                                  │  }}}                         │
  │                                  │<─────────────────────────────│
  │                                  │                              │
  │  {role: "assistant",             │                              │
  │   content: "..."}                │                              │
  │<─────────────────────────────────│                              │
```

### Streaming

```
Client                          Next.js API Route              Platform Backend
  │                                  │                              │
  │  POST /api/chat                  │                              │
  │  {messages, agentId,             │                              │
  │   stream: true}                  │                              │
  │─────────────────────────────────>│                              │
  │                                  │  POST /workflows/{id}/run   │
  │                                  │  {input: {user_prompt, ...}} │
  │                                  │─────────────────────────────>│
  │                                  │  {data: {id: 456, status:   │
  │                                  │   "pending"}}                │
  │                                  │<─────────────────────────────│
  │                                  │                              │
  │                                  │  GET /jobs/456/stream        │
  │                                  │  (SSE connection)            │
  │                                  │─────────────────────────────>│
  │                                  │                              │
  │  SSE: data: {"choices":[{        │  SSE: {type: "update",      │
  │   "delta":{"content":"Hi"}}]}    │   result: {stream: {agent:  │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│   {chunks: [...]}}}}       │
  │                                  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
  │                                  │                              │
  │  SSE: data: [DONE]              │  SSE: {type: "done"}         │
  │<─────────────────────────────────│                              │
```

## Shared Bridge Logic

File: `lib/platform/chat-bridge.ts`

```typescript
// Core function that both endpoints call

interface ChatBridgeOptions {
  workflowId: number
  userMessage: string
  sessionId: string | null
  stream: boolean
  accessToken: string
}

interface ChatBridgeResult {
  content: string
  sessionId: string
  metadata: {
    model: string
    totalCost: number
    executionTime: number
    totalInputTokens: number
    totalOutputTokens: number
    toolCallsMade: number
    subagentCallsMade: number
  }
}
```

### `runSync(options: ChatBridgeOptions): Promise<ChatBridgeResult>`

1. Call `POST ${PLATFORM_API_URL}/workflows/${workflowId}/run-sync` with:
   ```json
   {
     "input": {
       "user_prompt": "<userMessage>",
       "session_id": "<sessionId or empty string>"
     }
   }
   ```
2. Extract result from response. The response path based on the existing demo:
   ```
   response.data.result.results.<outputNodeId>[0].results.data
   ```
   The output node ID varies per workflow. We need to find the `agentOutput` node's result.
   
   Alternative: iterate `result.results` and find the key that contains our agent output.
   
3. Extract `session_id` from the agent output (returned by deep agent as `sessionId`)
4. Extract `metadata` from the agent output
5. Extract `content` — either `structured_response.answer` or `content` depending on response_format

### `runStream(options: ChatBridgeOptions): ReadableStream`

1. Call `POST ${PLATFORM_API_URL}/workflows/${workflowId}/run` (async)
2. Get `job_id` from response
3. Connect to `GET ${PLATFORM_API_URL}/jobs/${jobId}/stream` as SSE
4. Track `lastChunkIndex = 0`
5. On each SSE `update` event:
   - Read `result.stream.agent.chunks` array
   - Forward new chunks (index >= lastChunkIndex) to the output stream
   - Update lastChunkIndex
6. On SSE `done` event:
   - Read final `result.results` for session_id and metadata
   - Close the output stream
7. Return a `ReadableStream` that emits OpenAI `chat.completion.chunk` objects

## Output Node ID Resolution

The workflow result is keyed by output node ID (e.g., `httpResponse-1`). Since we create the workflow, we know the node IDs. The bridge needs a mapping from workflow_id to its output node ID.

Options:
- **Store it**: When creating the workflow, save the output node ID in the local agent record
- **Convention**: Always use `httpResponse-0` as the output node ID in our template
- **Discovery**: Iterate `result.results` keys and find the one with agent output shape

Best approach: use a fixed convention. Our workflow template always uses `httpResponse-0` as the response node.

## OpenAI-Compatible Endpoint Detail

### Request Schema

```typescript
// POST /api/v1/agent/[id]/v1/chat/completions
interface OpenAIChatRequest {
  model?: string              // ignored — the agent's model is in the workflow
  messages: {
    role: "system" | "user" | "assistant"
    content: string
  }[]
  stream?: boolean            // default false
  // Other OpenAI fields (temperature, max_tokens, etc.) ignored
}
```

### Non-Streaming Response

```typescript
interface OpenAIChatResponse {
  id: string                  // "chatcmpl-" + uuid
  object: "chat.completion"
  created: number             // unix timestamp
  model: string               // from agent metadata
  choices: [{
    index: 0
    message: {
      role: "assistant"
      content: string
    }
    finish_reason: "stop"
  }]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

### Streaming Response

SSE stream where each event is:
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"token"},"finish_reason":null}]}

data: [DONE]
```

These are the exact chunks from `job.result.stream.agent.chunks[]` — they're already in OpenAI format (the deep agent streaming plan produces them that way). We just forward them.

## Vercel AI SDK Endpoint Detail

### `POST /api/chat`

The Vercel AI SDK `useChat` hook sends:
```json
{
  "messages": [{"role": "user", "content": "..."}],
  "data": {
    "agentId": "local-agent-uuid",
    "conversationId": "local-conversation-uuid"
  }
}
```

The route handler uses the `ai` package's `streamText` or `createDataStreamResponse`:

```typescript
// app/api/chat/route.ts (conceptual)
import { createDataStreamResponse, formatDataStreamPart } from "ai"

export async function POST(req: Request) {
  const { messages, data } = await req.json()
  const { agentId, conversationId } = data

  // Look up agent → get workflow_id, session_id from conversation
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  const conversation = conversationId
    ? await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) })
    : null

  const lastMessage = messages[messages.length - 1].content

  // Save user message to local DB
  await saveMessage(conversationId, "user", lastMessage)

  // Start async workflow run
  const job = await platformClient.runWorkflow(agent.workflowId, {
    user_prompt: lastMessage,
    session_id: conversation?.sessionId || "",
  })

  // Stream back via SSE bridge
  return createDataStreamResponse({
    execute: async (dataStream) => {
      const stream = await platformClient.streamJob(job.id)

      let lastChunkIndex = 0
      for await (const event of stream) {
        const chunks = event.result?.stream?.agent?.chunks || []
        for (let i = lastChunkIndex; i < chunks.length; i++) {
          const chunk = chunks[i]
          const content = chunk.choices?.[0]?.delta?.content
          if (content) {
            dataStream.writeData(formatDataStreamPart("text", content))
          }
        }
        lastChunkIndex = chunks.length

        if (event.type === "done") {
          // Extract session_id from final result
          const sessionId = extractSessionId(event.result)
          // Save assistant message and update conversation
          await saveAssistantMessage(conversationId, event.result)
          if (sessionId) {
            await updateConversationSessionId(conversationId, sessionId)
          }
          break
        }
      }
    }
  })
}
```

## Message Extraction from Workflow Result

The workflow result structure (from the existing demo) follows this path:

```
job.result.results
  └── "httpResponse-0" (or whatever the output node ID is)
       └── [0]
            └── results
                 └── data
                      ├── answer/content  — the text response
                      ├── session_id      — for multi-turn
                      └── metadata        — execution stats
```

For our template workflow, the agentOutput node passes through the deep agent's output. The exact field names depend on whether we use `response_format` (structured → `.answer`) or not (unstructured → last AI message content).

**Decision**: For the chatbot, do NOT use `response_format`. Let the agent return free-form text. This simplifies extraction: the content is in the last message of the LangGraph state.

The deep agent output schema includes:
- `session_id` — for multi-turn
- `metadata` — execution stats (cost, tokens, time)
- `content` or `structured_response` — the actual answer

## Conversation State Management

### New Conversation Flow

1. User opens `/agents/[id]/chat` (no conversationId)
2. Frontend creates a local conversation record with `session_id: null`
3. First message sends with `session_id: ""`
4. Backend returns a `session_id` in the response
5. Frontend updates the local conversation with the returned `session_id`
6. Subsequent messages include this `session_id`

### Existing Conversation Flow

1. User opens `/agents/[id]/chat/[conversationId]`
2. Frontend loads messages from local DB
3. Sends messages with the stored `session_id`
4. Deep agent loads server-side history automatically

### Message Storage

After each exchange:
1. Save user message to local `messages` table
2. On response complete, save assistant message with metadata
3. Update conversation's `updated_at` and `title` (auto-generate from first message)
