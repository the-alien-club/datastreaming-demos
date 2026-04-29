"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatUI } from "@/components/chat/chat-ui"
import { apiFetch, apiUrl } from "@/lib/api-fetch"
import {
  clearStreamProgress,
  saveStreamProgress,
  type StreamProgressBeacon,
} from "@/lib/chat/stream-resume"

interface ChatPageProps {
  params: Promise<{ id: string }>
}

export default function NewChatPage({ params }: ChatPageProps) {
  const { id: agentId } = use(params)
  const router = useRouter()

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
      // Capture the conversation id assigned by the server on the first turn.
      if (
        dataPart.type === "data-conversationId" &&
        typeof dataPart.data === "string" &&
        !conversationIdRef.current
      ) {
        conversationIdRef.current = dataPart.data
      }

      // Mirror the stream-progress beacons that ExistingChatClient writes so
      // that, if the user navigates away mid-stream and returns via the
      // conversation URL, ExistingChatClient finds the cursor and resumes.
      if (dataPart.type === "data-streamProgress" && conversationIdRef.current) {
        const beacon = dataPart.data as Partial<StreamProgressBeacon> | undefined
        if (!beacon || typeof beacon.responseId !== "string") return
        if (typeof beacon.sequenceNumber !== "number") return
        if (beacon.terminal) {
          clearStreamProgress(conversationIdRef.current)
          return
        }
        saveStreamProgress(conversationIdRef.current, {
          responseId: beacon.responseId,
          sequenceNumber: beacon.sequenceNumber,
          terminal: false,
        })
      }
    },
  })

  // Once the stream settles, navigate to the conversation's permanent URL.
  // This must NOT happen mid-stream: calling router.replace with a new pathname
  // triggers a Next.js soft navigation that unmounts this component and discards
  // all streaming state before the response is rendered. Waiting for "ready" or
  // "error" means the stream is done, so navigation is safe. The resulting URL
  // points at ExistingChatPage (the [conversationId] route), which loads the
  // full history from Postgres — enabling "navigate away and come back" to work.
  const prevStatusRef = useRef(status)
  useEffect(() => {
    const wasActive =
      prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming"
    prevStatusRef.current = status

    if (wasActive && (status === "ready" || status === "error") && conversationIdRef.current) {
      router.replace(`/agents/${agentId}/chat/${conversationIdRef.current}`)
    }
  }, [status, agentId, router])

  function handleSend(text: string) {
    sendMessage({ text })
  }

  // "New chat" resets the in-memory session: drop the conversation ref and
  // clear messages. The URL is already at /agents/${agentId}/chat so no
  // navigation is needed.
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
