"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatUI } from "@/components/chat/chat-ui"
import { apiFetch, apiUrl } from "@/lib/api-fetch"

interface ChatPageProps {
  params: Promise<{ id: string }>
}

export default function NewChatPage({ params }: ChatPageProps) {
  const { id: agentId } = use(params)

  // Track the conversation id assigned by the server after the first message.
  // Held in a ref because we mutate it from `onData` (an event handler) and
  // read it lazily inside `prepareSendMessagesRequest` (also an event-handler
  // path — invoked by the transport, never during render).
  const conversationIdRef = useRef<string | null>(null)
  const [agentName, setAgentName] = useState<string | undefined>(undefined)
  const [starterPrompts, setStarterPrompts] = useState<string[]>([])

  // Load agent metadata (name, starter prompts) for display.
  useEffect(() => {
    apiFetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data: { name?: string; starterPrompts?: string[] }) => {
        if (data?.name) setAgentName(data.name)
        if (Array.isArray(data?.starterPrompts)) setStarterPrompts(data.starterPrompts)
      })
      .catch(() => undefined)
  }, [agentId])

  // Memoise transport so React's `useChat` doesn't churn its internal state
  // on every render. The closure captures `conversationIdRef` once, but
  // `prepareSendMessagesRequest` only fires from the transport's send path
  // (an event-handler context) — accessing `.current` there is correct.
  /* eslint-disable react-hooks/refs -- prepareSendMessagesRequest is invoked
     by the transport at send time, never during render. The lint rule can't
     prove that statically; the access is intentional and safe. */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl("/api/chat"),
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            agentId,
            conversationId: conversationIdRef.current ?? undefined,
          },
        }),
      }),
    [agentId],
  )
  /* eslint-enable react-hooks/refs */

  const { messages, setMessages, sendMessage, status, error } = useChat({
    transport,
    onData: (dataPart) => {
      // Receive conversationId from the server stream and store it so the next
      // turn can pass it as `conversationId` in the request body.
      // NOTE: we intentionally do NOT call window.history.replaceState here.
      // In Next.js App Router, replaceState with a different pathname triggers
      // a soft navigation to the new route ([conversationId]/page.tsx), which
      // unmounts this component mid-stream and discards all streaming state
      // before the AI response can be rendered. The conversation is still
      // persisted to the DB and accessible from the conversations list.
      if (
        dataPart.type === "data-conversationId" &&
        typeof dataPart.data === "string" &&
        !conversationIdRef.current
      ) {
        conversationIdRef.current = dataPart.data
      }
    },
  })

  function handleSend(text: string) {
    sendMessage({ text })
  }

  // "New chat" resets the in-memory session: drop the conversation ref and
  // clear messages. The URL is already at /agents/${agentId}/chat so no
  // replaceState is needed.
  function handleNewChat() {
    conversationIdRef.current = null
    setMessages([])
  }

  return (
    <ChatUI
      agentId={agentId}
      agentName={agentName}
      messages={messages as UIMessage[]}
      status={status}
      error={error}
      starterPrompts={starterPrompts}
      onSend={handleSend}
      onNewChat={handleNewChat}
    />
  )
}
