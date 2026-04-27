"use client"

import { memo, useEffect, useRef, useState, type KeyboardEvent, type FormEvent } from "react"
import type { UIMessage } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SendHorizonal, SquarePen, Bot, UsersRound, Wrench, Sparkles } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatUIProps {
  agentId: string
  agentName?: string
  messages: UIMessage[]
  status: "submitted" | "streaming" | "ready" | "error"
  error?: Error
  conversationId?: string
  starterPrompts?: string[]
  onSend: (text: string) => void
  onNewChat?: () => void
}

interface ToolCallData {
  id: string
  name: string
  args: unknown
}

interface SubagentData {
  agentId: string
  name: string
  kind: "main" | "subagent" | "tool"
  parentId: string | null
  dispatchedByToolCallId: string | null
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

function isSubagentPart(p: AnyPart): p is AnyPart & { data: SubagentData } {
  if (p.type !== "data-subagent") return false
  const data = (p as { data?: unknown }).data
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as { agentId?: unknown }).agentId === "string" &&
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

function SubagentPanel({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-900 dark:text-violet-200">
      <UsersRound className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
      <span className="font-medium">Subagent active:</span>
      <span className="font-mono break-all">{name}</span>
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
  // Render an inline "thinking" dots indicator at the end of this bubble —
  // used between a tool call and the next text chunk to signal the agent
  // is still working inside the same message.
  showThinking?: boolean
}

// Tailwind `prose` overrides applied to every assistant text bubble. The
// default plugin spacing is too tight for an inline chat bubble:
// paragraphs, headings, lists, and blockquotes crash into each other.
// Loosen with explicit child-selector classes so dark mode still inherits
// the prose-invert palette.
const PROSE_BUBBLE_CLASSES =
  "prose prose-sm dark:prose-invert max-w-none " +
  "prose-pre:rounded-lg prose-code:before:content-none prose-code:after:content-none " +
  "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 " +
  "[&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:mt-5 [&_h3]:mb-2 " +
  "[&_h4]:mt-4 [&_h4]:mb-2 " +
  "[&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_li>p]:my-1 " +
  "[&_blockquote]:my-3 [&_pre]:my-4 " +
  "[&_:first-child]:mt-0 [&_:last-child]:mb-0"

const MessageBubble = memo(function MessageBubble({
  message,
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
      // Markdown renders live during streaming. react-markdown re-parses
      // the accumulated text on each delta, which is fine for the
      // ~kilobyte-sized assistant turns this chat sees; if a future
      // workload pushes it into multi-thousand-line outputs we'll
      // memoize. Partial markdown (mid-token like `**bo`) renders
      // briefly ugly but tolerable — chasing prettiness here means
      // delaying the user's first read by seconds.
      rendered.push(
        <div
          key={`t-${idx}`}
          className={cn(
            "rounded-xl rounded-tl-none bg-card border px-4 py-2.5 text-sm wrap-break-word",
            PROSE_BUBBLE_CLASSES,
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
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
    if (isSubagentPart(part)) {
      rendered.push(<SubagentPanel key={`sp-${idx}`} name={part.data.name} />)
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
  starterPrompts,
  onSend,
  onNewChat,
}: ChatUIProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Track whether the user is anchored to the bottom. While streaming we
  // only auto-scroll when they're near the bottom — otherwise we'd drag
  // them back down on every chunk and they couldn't read previous content.
  const isNearBottomRef = useRef(true)

  const isLoading = status === "submitted" || status === "streaming"

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Auto-scroll only when the user is anchored to the bottom. Use
  // "instant" during streaming (smooth would compound into a janky
  // continuous animation as deltas arrive 30+ times/sec).
  useEffect(() => {
    if (!isNearBottomRef.current) return
    messagesEndRef.current?.scrollIntoView({
      behavior: status === "streaming" ? "instant" : "smooth",
    })
  }, [messages, status])

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

  function handleStarterPromptClick(prompt: string) {
    setInput(prompt)
    const el = textareaRef.current
    if (el) {
      el.focus()
      // Place cursor at end and resize to fit pasted text
      el.setSelectionRange(prompt.length, prompt.length)
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }

  const showStarterPrompts =
    messages.length === 0 &&
    !isLoading &&
    Array.isArray(starterPrompts) &&
    starterPrompts.length > 0

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
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
      >
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
        {showStarterPrompts && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            data-testid="starter-prompts"
          >
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {starterPrompts!.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal text-left text-xs leading-snug py-1.5 px-2.5"
                onClick={() => handleStarterPromptClick(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}
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
