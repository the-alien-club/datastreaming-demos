"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatUI } from "@/components/chat/chat-ui"

interface ExistingChatClientProps {
  agentId: string
  agentName: string
  conversationId: string
  initialMessages: Array<{
    id: string
    role: "user" | "assistant"
    parts: Array<{ type: "text"; text: string }>
  }>
}

export function ExistingChatClient({
  agentId,
  agentName,
  conversationId,
  initialMessages,
}: ExistingChatClientProps) {
  const router = useRouter()
  const conversationIdRef = useRef<string>(conversationId)

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages as UIMessage[],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
        body: {
          ...body,
          id,
          messages,
          trigger,
          messageId,
          agentId,
          conversationId: conversationIdRef.current,
        },
      }),
    }),
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
      conversationId={conversationId}
      onSend={handleSend}
      onNewChat={handleNewChat}
    />
  )
}
