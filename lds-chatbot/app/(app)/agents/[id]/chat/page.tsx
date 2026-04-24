"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatUI } from "@/components/chat/chat-ui"

interface ChatPageProps {
  params: Promise<{ id: string }>
}

export default function NewChatPage({ params }: ChatPageProps) {
  const { id: agentId } = use(params)
  const router = useRouter()

  // Track the conversation id assigned by the server after the first message
  const conversationIdRef = useRef<string | null>(null)
  const [agentName, setAgentName] = useState<string | undefined>(undefined)

  // Load agent name for display
  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data: { name?: string }) => {
        if (data?.name) setAgentName(data.name)
      })
      .catch(() => undefined)
  }, [agentId])

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Inject agentId + conversationId into the request body.
      // The SDK skips its default body assembly when we return a `body`, so
      // we must forward id/messages/trigger/messageId ourselves.
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
    onData: (dataPart) => {
      // Receive conversationId from the server stream
      if (
        dataPart.type === "data-conversationId" &&
        typeof dataPart.data === "string" &&
        !conversationIdRef.current
      ) {
        const convId = dataPart.data
        conversationIdRef.current = convId
        // Update URL to make it bookmarkable without triggering a full navigation
        window.history.replaceState(null, "", `/agents/${agentId}/chat/${convId}`)
      }
    },
  })

  function handleSend(text: string) {
    sendMessage({ text })
  }

  function handleNewChat() {
    router.push(`/agents/${agentId}/chat`)
  }

  return (
    <ChatUI
      agentId={agentId}
      agentName={agentName}
      messages={messages as UIMessage[]}
      status={status}
      error={error}
      onSend={handleSend}
      onNewChat={handleNewChat}
    />
  )
}
