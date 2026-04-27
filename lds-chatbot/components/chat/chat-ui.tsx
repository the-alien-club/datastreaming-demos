"use client"

import {
  memo,
  useState,
  type KeyboardEvent,
  type FormEvent,
} from "react"
import type { UIMessage } from "ai"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning"
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  Bot,
  SendHorizonal,
  SquarePen,
  Sparkles,
  UsersRound,
  WrenchIcon,
} from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

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

// ── Part type guards ───────────────────────────────────────────────────────────

type AnyPart = { type: string } & Record<string, unknown>

function isTextPart(p: AnyPart): p is AnyPart & { text: string } {
  return p.type === "text" && typeof (p as { text?: unknown }).text === "string"
}

function isReasoningPart(p: AnyPart): p is AnyPart & { text: string } {
  return (
    p.type === "reasoning" &&
    typeof (p as { text?: unknown }).text === "string"
  )
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

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="rounded-xl rounded-tl-none border bg-card px-4 py-3">
        <Shimmer as="span" duration={1.5}>
          Thinking...
        </Shimmer>
      </div>
    </div>
  )
}

// ── Subagent chain-of-thought panel ───────────────────────────────────────────

interface SubagentPanelProps {
  name: string
  // Tool-call parts that belong to this subagent activation (gathered later)
  toolCalls: Array<{ name: string; args: unknown }>
  // Text parts emitted by this subagent
  textParts: string[]
  isStreaming: boolean
}

const SubagentPanel = memo(function SubagentPanel({
  name,
  toolCalls,
  textParts,
  isStreaming,
}: SubagentPanelProps) {
  const text = textParts.join("\n\n")
  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>
        <span className="flex items-center gap-2">
          <UsersRound className="h-4 w-4" />
          {isStreaming ? (
            <Shimmer as="span" duration={1.5}>
              {name}
            </Shimmer>
          ) : (
            <span>{name}</span>
          )}
        </span>
      </ChainOfThoughtHeader>

      <ChainOfThoughtContent>
        {toolCalls.map((tc, i) => (
          <ChainOfThoughtStep
            key={`tc-${i}`}
            icon={WrenchIcon}
            label={
              <span className="font-mono text-xs">{cleanToolName(tc.name)}</span>
            }
            description={
              tc.args
                ? (() => {
                    const entries = Object.entries(
                      tc.args as Record<string, unknown>
                    )
                      .filter(([, v]) => v !== undefined && v !== null && v !== "")
                      .slice(0, 3)
                    return entries.length > 0
                      ? entries
                          .map(([k, v]) => {
                            const s =
                              typeof v === "string" ? v : JSON.stringify(v)
                            return `${k}: ${s.length > 50 ? `${s.slice(0, 50)}…` : s}`
                          })
                          .join(" · ")
                      : undefined
                  })()
                : undefined
            }
            status={isStreaming ? "active" : "complete"}
          />
        ))}

        {text && (
          <div className="rounded-md border-l-2 border-violet-500/60 bg-violet-500/5 pl-3 pr-2 py-2 text-sm text-muted-foreground">
            <MessageResponse>{text}</MessageResponse>
          </div>
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
})

// ── Tool call card ─────────────────────────────────────────────────────────────

interface ToolCallCardProps {
  name: string
  args: unknown
}

const ToolCallCard = memo(function ToolCallCard({
  name,
  args,
}: ToolCallCardProps) {
  const pretty = cleanToolName(name)
  // Build a synthetic ToolUIPart-compatible state to reuse ToolHeader badge.
  // We only receive a data-toolCall event (no result part from this stream),
  // so treat it as "input-available" (running).
  const toolInput =
    args && typeof args === "object"
      ? (args as Record<string, unknown>)
      : {}

  return (
    <Tool defaultOpen={false}>
      <ToolHeader
        type={"dynamic-tool" as const}
        state="input-available"
        toolName={pretty}
        title={pretty}
      />
      <ToolContent>
        <ToolInput input={toolInput} />
        <ToolOutput output={undefined} errorText={undefined} />
      </ToolContent>
    </Tool>
  )
})

// ── Subagent "task" dispatch block ─────────────────────────────────────────────

function SubagentDispatchBlock({ description }: { description: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-900 dark:text-violet-200">
      <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Delegating to subagent</div>
        {description && (
          <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs opacity-80">
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Message bubble (assistant) ─────────────────────────────────────────────────

interface AssistantBubbleProps {
  message: UIMessage
  isLast: boolean
  isStreaming: boolean
}

/**
 * Groups message parts into logical sections for rendering. The algorithm
 * walks the parts array once and accumulates:
 *  - contiguous text chunks into a single MessageResponse
 *  - reasoning parts into a Reasoning block
 *  - data-toolCall parts into ToolCallCard components (unless they are
 *    "task" tool calls, which become SubagentDispatchBlock)
 *  - data-subagent announcements open a SubagentPanel that collects the
 *    tool calls and text that follow until the next data-subagent or end
 */
const AssistantBubble = memo(function AssistantBubble({
  message,
  isLast,
  isStreaming,
}: AssistantBubbleProps) {
  const parts = (message.parts ?? []) as AnyPart[]

  // ── Collect reasoning parts for a single collapsed Reasoning block ──────────
  const reasoningText = parts
    .filter(isReasoningPart)
    .map((p) => p.text)
    .join("\n\n")

  // ── Walk parts once to build a render-list ──────────────────────────────────
  type Section =
    | { kind: "text"; text: string }
    | { kind: "toolCall"; name: string; args: unknown }
    | { kind: "taskDispatch"; description: string | null }
    | { kind: "subagent"; name: string; toolCalls: Array<{ name: string; args: unknown }>; textParts: string[] }

  const sections: Section[] = []

  let currentSubagent: (Section & { kind: "subagent" }) | null = null

  function flush() {
    if (currentSubagent) {
      sections.push(currentSubagent)
      currentSubagent = null
    }
  }

  for (const part of parts) {
    if (isReasoningPart(part)) {
      // Reasoning is shown in a dedicated block at the top; skip here.
      continue
    }

    if (isSubagentPart(part)) {
      flush()
      currentSubagent = {
        kind: "subagent",
        name: part.data.name,
        toolCalls: [],
        textParts: [],
      }
      continue
    }

    if (isToolCallPart(part)) {
      const { name, args } = part.data

      if (name === "task") {
        // The "task" pseudo-tool is the platform's subagent-dispatch call.
        if (currentSubagent) {
          // Treat as context for the subagent we're building.
          currentSubagent.toolCalls.push({ name, args })
        } else {
          flush()
          sections.push({ kind: "taskDispatch", description: subagentDescription(args) })
        }
        continue
      }

      if (currentSubagent) {
        currentSubagent.toolCalls.push({ name, args })
      } else {
        flush()
        sections.push({ kind: "toolCall", name, args })
      }
      continue
    }

    if (isTextPart(part) && part.text) {
      if (currentSubagent) {
        currentSubagent.textParts.push(part.text)
      } else {
        // Merge with previous text section if possible.
        const last = sections[sections.length - 1]
        if (last?.kind === "text") {
          last.text += part.text
        } else {
          flush()
          sections.push({ kind: "text", text: part.text })
        }
      }
    }
  }

  // Flush any open subagent.
  flush()

  if (sections.length === 0 && !reasoningText) return null

  return (
    <Message from="assistant">
      <MessageContent>
        {/* Reasoning — always first, collapsed by default after streaming */}
        {reasoningText && (
          <Reasoning isStreaming={isLast && isStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}

        {sections.map((section, idx) => {
          switch (section.kind) {
            case "text":
              return (
                <MessageResponse key={`t-${idx}`}>
                  {section.text}
                </MessageResponse>
              )

            case "toolCall":
              return (
                <ToolCallCard
                  key={`tc-${idx}`}
                  name={section.name}
                  args={section.args}
                />
              )

            case "taskDispatch":
              return (
                <SubagentDispatchBlock
                  key={`td-${idx}`}
                  description={section.description}
                />
              )

            case "subagent":
              return (
                <SubagentPanel
                  key={`sa-${idx}`}
                  name={section.name}
                  toolCalls={section.toolCalls}
                  textParts={section.textParts}
                  isStreaming={isLast && isStreaming}
                />
              )
          }
        })}

        {/* Inline "still working" shimmer at the end of an in-progress turn */}
        {isLast && isStreaming && sections.length > 0 && (
          <Shimmer as="p" className="text-xs text-muted-foreground" duration={1.5}>
            Working...
          </Shimmer>
        )}
      </MessageContent>
    </Message>
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
  const isLoading = status === "submitted" || status === "streaming"
  const lastMessage = messages[messages.length - 1]

  // Standalone "thinking" bubble: no assistant content exists yet.
  const showStandaloneIndicator =
    isLoading && (!lastMessage || lastMessage.role === "user")

  const showStarterPrompts =
    messages.length === 0 &&
    !isLoading &&
    Array.isArray(starterPrompts) &&
    starterPrompts.length > 0

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput("")
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  function handleStarterPromptClick(prompt: string) {
    setInput(prompt)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <h1 className="truncate text-lg font-semibold">
          {agentName ?? "Chat"}
        </h1>
        {onNewChat && (
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <SquarePen className="mr-1.5 h-3.5 w-3.5" />
            New chat
          </Button>
        )}
      </div>

      {/* Messages — Conversation handles sticky-bottom scrolling */}
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && !isLoading && (
            <ConversationEmptyState
              icon={<Bot className="h-12 w-12 opacity-30" />}
              title={agentName ? `Chat with ${agentName}` : "Start a conversation"}
              description="Ask anything — the agent will respond below."
            />
          )}

          {messages.map((message, idx) => {
            if (message.role === "user") {
              const parts = (message.parts ?? []) as AnyPart[]
              const text = parts.filter(isTextPart).map((p) => p.text).join("")
              if (!text) return null
              return (
                <Message key={message.id} from="user">
                  <MessageContent>{text}</MessageContent>
                </Message>
              )
            }

            return (
              <AssistantBubble
                key={message.id}
                message={message}
                isLast={idx === messages.length - 1}
                isStreaming={isLoading}
              />
            )
          })}

          {showStandaloneIndicator && <TypingIndicator />}

          {status === "error" && error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              Error: {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className="shrink-0 border-t px-6 py-4">
        {showStarterPrompts && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            data-testid="starter-prompts"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {starterPrompts!.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal py-1.5 px-2.5 text-left text-xs leading-snug"
                onClick={() => handleStarterPromptClick(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <Textarea
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
            className={cn(
              "flex-1 min-h-11 max-h-[200px] resize-none overflow-y-auto",
              "text-sm leading-relaxed",
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
