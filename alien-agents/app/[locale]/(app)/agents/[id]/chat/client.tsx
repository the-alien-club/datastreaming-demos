"use client"

import { useMemo, useRef, useState, useEffect } from "react"
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

type AgentChatClientProps = {
  agentId: string
  initialAgentName: string
}

export function AgentChatClient({ agentId, initialAgentName }: AgentChatClientProps) {
  const router = useRouter()

  // Track the conversation id assigned by the server after the first message.
  // Held in a ref because we mutate it from `onData` (an event handler) and
  // read it lazily inside `prepareSendMessagesRequest` (also an event-handler
  // path — invoked by the transport, never during render).
  const conversationIdRef = useRef<string | null>(null)
  const responseIdRef = useRef<string | null>(null)

  // Memoise transport so React's `useChat` doesn't churn its internal state
  // on every render.
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

  const { messages, setMessages, sendMessage, stop, status, error } = useChat({
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

      // Mirror the stream-progress beacons that ConversationClient writes so
      // that, if the user navigates away mid-stream and returns via the
      // conversation URL, ConversationClient finds the cursor and resumes.
      if (dataPart.type === "data-streamProgress" && conversationIdRef.current) {
        const beacon = dataPart.data as Partial<StreamProgressBeacon> | undefined
        if (!beacon || typeof beacon.responseId !== "string") return
        if (typeof beacon.sequenceNumber !== "number") return

        responseIdRef.current = beacon.responseId

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
  // all streaming state before the response is rendered.
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

  function handleStop() {
    stop()
    const responseId = responseIdRef.current
    if (!responseId) return
    apiFetch("/api/chat/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, responseId }),
    }).catch(() => undefined)
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
      agentName={initialAgentName}
      messages={messages as UIMessage[]}
      status={status}
      error={error}
      onSend={handleSend}
      onStop={handleStop}
      onNewChat={handleNewChat}
    />
  )
}
