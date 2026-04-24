"use client"

import { memo, useEffect, useRef, useState, type KeyboardEvent, type FormEvent } from "react"
import type { UIMessage } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SendHorizonal, SquarePen, Bot, UsersRound, Wrench } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatUIProps {
  agentId: string
  agentName?: string
  messages: UIMessage[]
  status: "submitted" | "streaming" | "ready" | "error"
  error?: Error
  conversationId?: string
  onSend: (text: string) => void
  onNewChat?: () => void
}

interface ToolCallData {
  id: string
  name: string
  args: unknown
}

// Part type guards — data parts carry `type: "data-<name>"` and a `data` payload.
type AnyPart = { type: string } & Record<string, unknown>

function isTextPart(p: AnyPart): p is AnyPart & { text: string } {
  return p.type === "text" && typeof (p as { text?: unknown }).text === "string"
}

function isToolCallPart(p: AnyPart): p is AnyPart & { data: ToolCallData } {
  if (p.type !== "data-toolCall") return false
  const data = (p as { data?: unknown }).data
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as { name?: unknown }).name === "string"
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function cleanToolName(name: string): string {
  // Strip the `mcp_<namespace>_<timestamp>_` prefix the platform adds to MCP
  // tools, e.g. `mcp_test_lds_1772018329422_datacluster_list_datasets`
  // → `datacluster_list_datasets`.
  const m = name.match(/^mcp_[a-z0-9_-]+?_\d{10,}_(.+)$/)
  return m ? m[1] : name
}

function subagentDescription(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const desc = (args as { description?: unknown }).description
  return typeof desc === "string" ? desc : null
}

// ── Typing indicator ───────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="flex gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="rounded-xl rounded-tl-none bg-card border px-4 py-3 w-fit">
        <ThinkingDots />
      </div>
    </div>
  )
}

// ── Tool-call blocks ───────────────────────────────────────────────────────────

function SubagentBlock({ description }: { description: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-900 dark:text-violet-200">
      <UsersRound className="h-4 w-4 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Delegating to subagent</div>
        {description && (
          <div className="text-xs opacity-80 mt-0.5 whitespace-pre-wrap wrap-break-word line-clamp-3">
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolCallChip({ name, args }: { name: string; args: unknown }) {
  const pretty = cleanToolName(name)
  const argSummary = (() => {
    if (!args || typeof args !== "object") return null
    const entries = Object.entries(args as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .slice(0, 3)
    if (entries.length === 0) return null
    return entries
      .map(([k, v]) => {
        const s = typeof v === "string" ? v : JSON.stringify(v)
        const clipped = s.length > 40 ? `${s.slice(0, 40)}…` : s
        return `${k}: ${clipped}`
      })
      .join(", ")
  })()

  return (
    <div className="inline-flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200 max-w-full">
      <Wrench className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <span className="font-mono font-medium break-all">{pretty}</span>
        {argSummary && (
          <span className="block opacity-70 mt-0.5 break-all">{argSummary}</span>
        )}
      </div>
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: UIMessage
  // When true, render text as plain pre-wrap instead of parsing markdown.
  // ReactMarkdown re-parses the full accumulated text on every delta, which
  // goes O(N²) across a long streamed response and freezes the tab. During
  // streaming we show plain text; once the message is finalized we upgrade
  // to markdown (one-time parse).
  isStreaming?: boolean
  // Render an inline "thinking" dots indicator at the end of this bubble —
  // used between a tool call and the next text chunk to signal the agent
  // is still working inside the same message.
  showThinking?: boolean
}

const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
  showThinking = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user"
  const parts = (message.parts ?? []) as AnyPart[]

  if (isUser) {
    const text = parts.filter(isTextPart).map((p) => p.text).join("")
    if (!text) return null
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-xl rounded-tr-none bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap wrap-break-word">
          {text}
        </div>
      </div>
    )
  }

  // Assistant: render parts in order so tool calls appear inline with text.
  const rendered: React.ReactNode[] = []
  parts.forEach((part, idx) => {
    if (isTextPart(part)) {
      if (!part.text) return
      rendered.push(
        <div
          key={`t-${idx}`}
          className={cn(
            "rounded-xl rounded-tl-none bg-card border px-4 py-2.5 text-sm max-w-none wrap-break-word",
            isStreaming
              ? "whitespace-pre-wrap leading-relaxed"
              : "prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:rounded-lg prose-code:before:content-none prose-code:after:content-none"
          )}
        >
          {isStreaming ? (
            part.text
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
          )}
        </div>
      )
      return
    }
    if (isToolCallPart(part)) {
      const { name, args } = part.data
      if (name === "task") {
        rendered.push(
          <SubagentBlock key={`s-${idx}`} description={subagentDescription(args)} />
        )
      } else {
        rendered.push(<ToolCallChip key={`c-${idx}`} name={name} args={args} />)
      }
      return
    }
    // Unknown part types (e.g. data-conversationId) are intentionally ignored.
  })

  if (showThinking) {
    rendered.push(
      <div
        key="thinking"
        className="rounded-xl rounded-tl-none bg-card border px-4 py-2.5 w-fit"
      >
        <ThinkingDots />
      </div>
    )
  }

  if (rendered.length === 0) return null

  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-2 max-w-[75%] min-w-0">{rendered}</div>
    </div>
  )
})

// ── Main component ─────────────────────────────────────────────────────────────

export function ChatUI({
  agentId: _agentId,
  agentName,
  messages,
  status,
  error,
  conversationId: _conversationId,
  onSend,
  onNewChat,
}: ChatUIProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isLoading = status === "submitted" || status === "streaming"

  // Auto-scroll to bottom when messages change or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput("")
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // The agent is "working" for the entire `submitted`→`streaming` window. The
  // dots stay visible that whole time and only disappear when the turn is
  // complete (`status` becomes `ready` / `error`).
  const lastMessage = messages[messages.length - 1]

  // Standalone "thinking" bubble: no assistant content exists yet.
  const showStandaloneIndicator =
    isLoading && (!lastMessage || lastMessage.role === "user")

  // Inline dots at the end of the in-progress assistant bubble — keeps the
  // "still working" signal attached to the answer even while text is streaming
  // or between a tool call and the next chunk.
  const inlineThinkingIdx =
    isLoading && lastMessage?.role === "assistant" ? messages.length - 1 : -1

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h1 className="text-lg font-semibold truncate">
          {agentName ?? "Chat"}
        </h1>
        {onNewChat && (
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <SquarePen className="h-3.5 w-3.5 mr-1.5" />
            New chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
            <Bot className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-base font-medium">
              {agentName ? `Chat with ${agentName}` : "Start a conversation"}
            </p>
            <p className="text-sm mt-1 opacity-70">
              Ask anything — the agent will respond below.
            </p>
          </div>
        )}

        {messages.map((message, idx) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={
              status === "streaming" &&
              idx === messages.length - 1 &&
              message.role === "assistant"
            }
            showThinking={idx === inlineThinkingIdx}
          />
        ))}

        {showStandaloneIndicator && <TypingIndicator />}

        {status === "error" && error && (
          <div className="text-sm text-destructive px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
            Error: {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t px-6 py-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
            className={cn(
              "flex-1 min-h-11 max-h-50 resize-none overflow-y-auto",
              "text-sm leading-relaxed"
            )}
            disabled={isLoading}
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="h-11 w-11 shrink-0"
          >
            <SendHorizonal className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
