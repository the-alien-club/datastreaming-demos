"use client"

import { useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai"
import { ChatUI } from "@/components/chat/chat-ui"
import { apiUrl } from "@/lib/api-fetch"
import {
  clearStreamProgress,
  loadStreamProgress,
  saveStreamProgress,
  type StreamProgressBeacon,
} from "@/lib/chat/stream-resume"

interface ExistingChatClientProps {
  agentId: string
  agentName: string
  conversationId: string
  // Each message's `parts` may be a single text part (legacy / user rows)
  // or the full structured stream from the `messages.parts` jsonb column —
  // text bubbles, tool-call chips, subagent panels. The chat UI's
  // `MessageBubble` already type-guards every part, so anything unknown
  // is silently dropped.
  initialMessages: Array<{
    id: string
    role: "user" | "assistant"
    parts: Array<{ type: string } & Record<string, unknown>>
  }>
}

export function ExistingChatClient({
  agentId,
  agentName,
  conversationId,
  initialMessages,
}: ExistingChatClientProps) {
  const router = useRouter()

  // Memoise the transport against the stable (agentId, conversationId) pair
  // — React's `useChat` recreates internal state when the transport identity
  // changes, so building it inline on every render churns the chat session.
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
            conversationId,
          },
        }),
      }),
    [agentId, conversationId],
  )

  const { messages, sendMessage, setMessages, status, error } = useChat({
    messages: initialMessages as UIMessage[],
    transport,
    onData: (dataPart) => {
      // Persist `(responseId, lastSeq)` to localStorage as the stream
      // advances. On a tab refresh the mount-time effect below picks
      // this up and reconnects via the platform's resume endpoint.
      if (dataPart.type !== "data-streamProgress") return
      const beacon = dataPart.data as Partial<StreamProgressBeacon> | undefined
      if (!beacon || typeof beacon.responseId !== "string") return
      if (typeof beacon.sequenceNumber !== "number") return

      if (beacon.terminal) {
        clearStreamProgress(conversationId)
        return
      }

      saveStreamProgress(conversationId, {
        responseId: beacon.responseId,
        sequenceNumber: beacon.sequenceNumber,
        terminal: false,
      })
    },
  })

  // Reconnect to the platform's resume endpoint on mount when localStorage
  // shows a stream was in flight for this conversation. Spec §5 says
  // `GET /agent/:id/responses/:respId?starting_after=<seq>` replays every
  // event past the cursor and stays open if the response is still live;
  // we proxy that through `/api/chat/resume` (which carries the OAuth
  // token) and fold the resulting AI SDK UI message stream into our
  // local messages list. The effect runs once per mount — `setMessages`
  // and the conversation/agent ids are stable references for this page.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true

    const pending = loadStreamProgress(conversationId)
    if (!pending) return

    const controller = new AbortController()
    void resumeStream({
      conversationId,
      responseId: pending.responseId,
      startingAfter: pending.sequenceNumber,
      setMessages,
      signal: controller.signal,
    })

    return () => controller.abort()
    // setMessages from useChat is stable; conversationId is the route
    // key. Re-running on either changing would imply a new chat session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

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

/**
 * Reconnect to a mid-stream response: fetch the resume endpoint, parse
 * its SSE frames into AI SDK `UIMessageChunk`s, feed them through
 * `readUIMessageStream`, and upsert the resulting assistant message
 * into the chat. On terminal events the localStorage cursor is
 * cleared by the matching `data-streamProgress` from the resumed stream.
 */
async function resumeStream({
  conversationId,
  responseId,
  startingAfter,
  setMessages,
  signal,
}: {
  conversationId: string
  responseId: string
  startingAfter: number
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
  signal: AbortSignal
}): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl("/api/chat/resume"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, responseId, startingAfter }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) return
    console.error("Chat resume request failed:", e)
    clearStreamProgress(conversationId)
    return
  }

  if (!response.ok || !response.body) {
    // 410 = response expired; 404 = conversation/agent gone. Either way
    // there's nothing to recover — clear the cursor and let the user
    // start fresh.
    if (response.status === 410 || response.status === 404) {
      clearStreamProgress(conversationId)
    }
    return
  }

  const chunkStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(uiMessageSseTransform())

  // Seed the assistant bubble with whatever's already in messages — the
  // resume yields chunks that update an existing assistant message.
  // `readUIMessageStream` enriches the message in-place; we splice it
  // back into the chat list as an upsert.
  const messageId = `resumed-${responseId}`
  const seedMessage: UIMessage = {
    id: messageId,
    role: "assistant",
    parts: [],
  }

  setMessages((prev) => {
    if (prev.some((m) => m.id === messageId)) return prev
    return [...prev, seedMessage]
  })

  try {
    for await (const updated of readUIMessageStream({ message: seedMessage, stream: chunkStream })) {
      if (signal.aborted) return
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === updated.id)
        if (idx === -1) return [...prev, updated]
        const next = prev.slice()
        next[idx] = updated
        return next
      })
    }
  } catch (e) {
    if (!signal.aborted) {
      console.error("Chat resume stream consumption failed:", e)
    }
  }
}

/**
 * Parse `text/event-stream` chunks (already TextDecoded) into AI SDK
 * `UIMessageChunk`s. The chatbot's `/api/chat/resume` route emits the
 * standard AI SDK UI message stream format — one JSON `UIMessageChunk`
 * per SSE `data:` payload.
 */
function uiMessageSseTransform(): TransformStream<string, UIMessageChunk> {
  let buffer = ""
  return new TransformStream<string, UIMessageChunk>({
    transform(chunk, controller) {
      buffer += chunk
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")

        const dataLines: string[] = []
        for (const rawLine of frame.split("\n")) {
          if (rawLine.startsWith(":") || rawLine.length === 0) continue
          if (rawLine.startsWith("data:")) {
            dataLines.push(rawLine.slice(5).replace(/^ /, ""))
          }
        }
        if (dataLines.length === 0) continue

        const dataStr = dataLines.join("\n")
        try {
          const parsed = JSON.parse(dataStr) as UIMessageChunk
          controller.enqueue(parsed)
        } catch {
          // Drop malformed frames silently — the stream is best-effort.
        }
      }
    },
  })
}
