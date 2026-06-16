"use client"

import { useEffect, useRef, useState } from "react"
import { Streamdown } from "streamdown"
import type { Mode } from "@/hooks/use-mode"
import type {
  AgentAuthor,
  AgentPart,
  AgentTurn,
  AgentType,
  ChatMessage,
  ToolEntry,
} from "@/lib/chat-messages"
import { Icon, type IconName } from "../icons"

const NODES = [
  { k: "planner", ic: "cpu" as IconName, lab: "Planner" },
  { k: "specialist", ic: "search" as IconName, lab: "Specialist" },
  { k: "critic", ic: "check" as IconName, lab: "Critic" },
] as const

export type TimelineState = "pending" | "exec" | "done"
/**
 * Per-stage rail node state.
 *
 * - `status` — `pending` (not yet visited), `exec` (currently running), `done`
 * - `count`  — how many dispatches of this canonical type we've seen this
 *              turn. Surfaced as a small badge next to the rail node so an
 *              iterative workflow ("planner ran twice, 4 specialists per
 *              planner pass") is legible at a glance.
 */
export interface TimelineNode {
  status: TimelineState
  count: number
}
export type Timeline = Record<"planner" | "specialist" | "critic", TimelineNode>

/**
 * Live elapsed-time counter (e.g. "3.2s"), ticks every 200ms while `running`.
 * When `running` flips false the parent's `endedAt` is the final value frozen
 * in place.
 */
function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [running])
  return Math.max(0, now - startedAt)
}

function ToolCard({ tool, fresh }: { tool: ToolEntry; fresh?: boolean }) {
  const [open, setOpen] = useState(false)
  const elapsedMs = useElapsed(tool.startedAt, tool.running)
  const elapsedLabel =
    elapsedMs < 1000
      ? `${elapsedMs}ms`
      : `${(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)}s`
  return (
    <div className={`tool-card${fresh ? " enter" : ""}${tool.running ? " running" : ""}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`tool-chev${open ? " open" : ""}`}>
          <Icon name="chevR" size={13} />
        </span>
        <span className="tool-ic">
          {tool.running ? (
            <span className="tool-spinner" aria-hidden="true" />
          ) : (
            <Icon name={tool.icon} size={14} />
          )}
        </span>
        <span className="tool-nm">{tool.name}</span>
        <span className="tool-sum">{tool.summary}</span>
        <span className="tool-elapsed" aria-label="elapsed">
          {elapsedLabel}
        </span>
      </button>
      {open && (
        <div className="tool-body">
          <div className="tool-block">
            <div className="k">Arguments</div>
            <pre>{tool.args}</pre>
          </div>
          <div className="tool-block">
            <div className="k">Result preview</div>
            <pre>{tool.result || (tool.running ? "running…" : "(no output)")}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ChainOfThought({ chain }: { chain: { who: string; text: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="chain-card">
      <button
        type="button"
        className="chain-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`tool-chev${open ? " open" : ""}`}>
          <Icon name="chevR" size={13} />
        </span>
        <span className="tool-ic">
          <Icon name="network" size={13} />
        </span>
        <span className="chain-nm">Chain of thought</span>
        <span className="tool-sum">{chain.length} subagent steps</span>
      </button>
      {open && (
        <div className="chain-body">
          {chain.map((c, i) => (
            <div className="chain-step" key={i}>
              <span className="chain-who">{c.who}</span>
              <span className="chain-text">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Subagent banner — large in-message block marking which orchestrated agent
 * (Planner / Specialist / Critic) took over for the next slice of work. The
 * left rail also shows the same info, but the banner is the chronological
 * marker: it sits inline with text and tool cards so the user can see
 * "Specialist did the searches BETWEEN these two text blocks".
 */
const SUBAGENT_META: Record<
  AgentType,
  { icon: IconName; label: string; description: string } | null
> = {
  main: null,
  planner: {
    icon: "cpu",
    label: "Planner",
    description: "Decomposing the question into focused research tasks",
  },
  specialist: {
    icon: "search",
    label: "Specialist",
    description: "Searching the configured sources and synthesising findings",
  },
  critic: {
    icon: "check",
    label: "Critic",
    description: "Reviewing the research for quality and completeness",
  },
  other: {
    icon: "spark",
    label: "Agent",
    description: "Running a dispatched workflow step",
  },
}

interface RenderCtx {
  streaming: boolean
  fresh: boolean
  faded: boolean | undefined
}

function InstanceCard({
  instanceKey: _instanceKey,
  canonicalType,
  displayName,
  ordinal,
  status,
  parts,
  ctx,
}: {
  instanceKey: string
  canonicalType: AgentType
  displayName: string
  ordinal: number
  status: "running" | "done"
  parts: AgentPart[]
  ctx: RenderCtx
}) {
  const meta = SUBAGENT_META[canonicalType] ?? SUBAGENT_META.other
  if (!meta) return null
  // While the parent message is streaming, this instance's children may
  // still grow. Freeze the streaming flag inside settled instances so cursors
  // don't blink after the dispatch closed.
  const childCtx: RenderCtx = { ...ctx, streaming: ctx.streaming && status === "running" }
  // Title: "Specialist #2" when more than one of the same canonical type ran
  // in this turn; just "Specialist" otherwise. `displayName` is shown as the
  // subtitle so the platform's raw registry label remains visible.
  const titleBase = meta.label
  const title = ordinal > 1 ? `${titleBase} #${ordinal}` : titleBase
  const subtitle = displayName && displayName !== meta.label ? displayName : meta.description
  return (
    <div
      className={`sub-block sub-block--${canonicalType} sub-block--${status}`}
      data-instance-key={_instanceKey}
    >
      <div className="sub-block__head">
        <span className="sub-block__ic">
          {status === "running" ? (
            <span className="tool-spinner" aria-hidden="true" />
          ) : (
            <Icon name={meta.icon} size={14} />
          )}
        </span>
        <div className="sub-block__body">
          <div className="sub-block__title">{title}</div>
          <div className="sub-block__desc">{subtitle}</div>
        </div>
        <span className={`sub-block__status sub-block__status--${status}`}>
          {status === "running" ? "active" : "done"}
        </span>
      </div>
      {parts.length === 0 ? (
        status === "running" ? (
          <div className="sub-block__children sub-block__placeholder">
            <span className="sub-block__placeholder-dot" />
            <span>Starting up…</span>
          </div>
        ) : null
      ) : (
        <div className="sub-block__children">{renderParts(parts, childCtx)}</div>
      )}
    </div>
  )
}

/**
 * The Planner emits its task list as a JSON array of `{q, tool}` objects.
 * Surfacing that as a one-line code block is ugly; once the JSON has fully
 * arrived we switch to a small card grid. While the JSON is still streaming
 * we keep rendering raw markdown so the user sees progressive output instead
 * of a stale "Decomposing…" placeholder — `parsePlannerTasks` returns `null`
 * on any incomplete / unrecognised payload and the caller falls back to
 * Streamdown.
 */
interface PlannerTask {
  q: string
  tool: string
}
function parsePlannerTasks(text: string): PlannerTask[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Strip a single ```json … ``` fence if present.
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const candidate = fence ? fence[1] : trimmed
  // Must look like an array — cheap check before paying JSON.parse cost.
  if (!candidate.startsWith("[")) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  const out: PlannerTask[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null
    const q = (item as { q?: unknown }).q
    const tool = (item as { tool?: unknown }).tool
    if (typeof q !== "string" || typeof tool !== "string") return null
    if (!q.trim() || !tool.trim()) return null
    out.push({ q: q.trim(), tool: tool.trim() })
  }
  return out
}

/** Strip the `mcp_<connector>_` prefix from the tool name for a friendlier
 * chip label — `mcp_datacluster_list_datasets` → `datacluster · list datasets`. */
function prettyToolName(raw: string): { connector: string; action: string } {
  const stripped = raw.replace(/^mcp[-_]/, "")
  const sep = stripped.indexOf("_")
  if (sep === -1) return { connector: stripped, action: "" }
  const connector = stripped.slice(0, sep)
  const action = stripped.slice(sep + 1).replace(/_/g, " ")
  return { connector, action }
}

function PlannerCards({ tasks }: { tasks: PlannerTask[] }) {
  return (
    <div className="planner-cards">
      {tasks.map((t, i) => {
        const { connector, action } = prettyToolName(t.tool)
        return (
          <div className="planner-card" key={i}>
            <div className="planner-card__num">{String(i + 1).padStart(2, "0")}</div>
            <div className="planner-card__body">
              <div className="planner-card__q">{t.q}</div>
              <div className="planner-card__tool">
                <Icon name="search" size={11} />
                <span className="planner-card__connector">{connector}</span>
                {action && (
                  <>
                    <span className="planner-card__sep">·</span>
                    <span className="planner-card__action">{action}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function renderParts(parts: AgentPart[], ctx: RenderCtx): React.ReactNode {
  return parts.map((p, i) => {
    if (p.kind === "tool") {
      return <ToolCard key={i} tool={p.tool} fresh={ctx.fresh} />
    }
    if (p.kind === "thinking") {
      const isOpen = ctx.streaming && i === parts.length - 1
      return <ThinkingBlock key={i} text={p.text} streaming={isOpen} />
    }
    if (p.kind === "instance") {
      return (
        <InstanceCard
          key={`${p.instanceKey}-${i}`}
          instanceKey={p.instanceKey}
          canonicalType={p.canonicalType}
          displayName={p.displayName}
          ordinal={p.ordinal}
          status={p.status}
          parts={p.children}
          ctx={ctx}
        />
      )
    }
    const author = p.author ?? "main"
    const isLast = i === parts.length - 1
    // Planner task lists: when text is authored by the planner subagent AND
    // parses cleanly as `[{q, tool}, …]`, swap the raw JSON for a card grid.
    // Strictly gated on `author === "planner"` so other subagents (e.g.
    // specialist) that may also emit structured payloads aren't hijacked.
    if (author === "planner") {
      const plannerTasks = parsePlannerTasks(p.text)
      if (plannerTasks) {
        return (
          <div key={i} className={`agent-text agent-text--planner${ctx.faded ? " faded" : ""}`}>
            <span className="agent-text__author">planner</span>
            <PlannerCards tasks={plannerTasks} />
          </div>
        )
      }
    }
    return (
      <div key={i} className={`agent-text agent-text--${author}${ctx.faded ? " faded" : ""}`}>
        {author !== "main" && <span className="agent-text__author">{author}</span>}
        <Streamdown
          animated
          // `animated` alone is a no-op — streamdown also needs
          // `isAnimating` flipped true to actually wrap newly mounted word-spans.
          isAnimating={ctx.streaming && isLast}
          parseIncompleteMarkdown
          linkSafety={{ enabled: false }}
          className="agent-md"
        >
          {p.text}
        </Streamdown>
        {ctx.streaming && isLast && <span className="cursor" />}
      </div>
    )
  })
}

/**
 * "Working..." pill shown between an agent's tool calls and its text, while
 * the model is silently reasoning (no current tool running, no text yet).
 * Surfaces the silent wait so the UI never looks frozen.
 */
function WorkingPill({ anchor }: { anchor: number }) {
  const elapsed = useElapsed(anchor, true)
  const label = elapsed < 1000 ? "Thinking…" : `Thinking… ${(elapsed / 1000).toFixed(1)}s`
  return (
    <div className="working-pill">
      <span className="working-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="working-label">{label}</span>
    </div>
  )
}

/**
 * Collapsible block that surfaces Anthropic extended-thinking deltas as they
 * stream in. Default-open while the message is streaming so the user can watch
 * the model reason live, default-closed once the answer lands so the final
 * text stays the focus.
 */
function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const open = openOverride ?? streaming
  // Sticky-bottom follow inside the thinking box, mirroring the chat-body
  // behaviour: each delta auto-scrolls to the bottom only while the user is
  // pinned there. Scroll up to read earlier reasoning → lock releases; scroll
  // back down → lock re-arms. Without this the box parked at the top and the
  // freshest tokens streamed below the fold.
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger
  useEffect(() => {
    const el = bodyRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [text])
  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom <= 32
  }
  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-head"
        onClick={() => setOpenOverride(!open)}
        aria-expanded={open}
      >
        <span className={`tool-chev${open ? " open" : ""}`}>
          <Icon name="chevR" size={13} />
        </span>
        <span className="tool-ic">
          <Icon name="spark" size={13} />
        </span>
        <span className="chain-nm">Thinking</span>
        <span className="tool-sum">
          {streaming ? "live" : `${text.length.toLocaleString()} chars`}
        </span>
      </button>
      {open && (
        <div className="thinking-body" ref={bodyRef} onScroll={onScroll}>
          {text}
          {streaming && <span className="cursor" />}
        </div>
      )}
    </div>
  )
}

function AgentMessage({ m }: { m: ChatMessage }) {
  if (m.role === "scope") {
    return (
      <div className="scope-notice">
        <span className="pulse-dot" />
        {m.text}
      </div>
    )
  }
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble-user">{m.text}</div>
      </div>
    )
  }
  return (
    <div className="msg agent">
      <div className="agent-sender">
        <span className="agent-ava">
          <img src="/assets/glyph-w.svg" alt="" />
        </span>
        <span className="nm">{m.sender || "Claude"}</span>
      </div>
      {m.chain && m.chain.length > 0 && <ChainOfThought chain={m.chain} />}
      {(() => {
        const parts = m.parts
        const lastPart = parts[parts.length - 1]
        // Show the bouncing "Thinking…" pill ONLY when nothing is currently
        // animating on its own — no part yet, or the last one is a settled
        // tool / done subagent block. A running tool has its own spinner; a
        // streaming text/thinking part has its own cursor.
        const inSilentGap =
          m.streaming &&
          (!lastPart ||
            (lastPart.kind === "tool" && !lastPart.tool.running) ||
            (lastPart.kind === "instance" && lastPart.status === "done"))
        const ctx: RenderCtx = { streaming: m.streaming, fresh: m.fresh, faded: m.faded }
        return (
          <>
            {renderParts(parts, ctx)}
            {inSilentGap && <WorkingPill anchor={lastTimerAnchor(parts)} />}
          </>
        )
      })()}
    </div>
  )
}

/**
 * Anchor for the "Thinking…" elapsed-time timer. Uses the last tool's
 * startedAt if a tool just finished, otherwise the message's own arrival
 * time so the timer still reads a sensible delta on turn 0.
 */
/**
 * Animated chip row under the composer. Three visible states:
 *
 *   1. **ready** — the model returned a set; chips fade-in one at a time
 *      (`@keyframes sugg-pop`, staggered by `--sugg-i`).
 *   2. **thinking** — chips have been dismissed (user clicked one OR a fresh
 *      turn finished) and we're waiting on Haiku; a single pill rotates
 *      between "Analyzing…" / "Proposing…" / "Composing…" to fill the gap.
 *   3. **dismissed-pre-turn** — between the click and the assistant stream
 *      ending the orchestrator hasn't asked for new suggestions yet (it
 *      pauses while `isStreaming`), so the row collapses to nothing rather
 *      than leave stale chips on screen.
 *
 * On the *first ever* load (no chips, status still loading) a thin shimmer
 * bar takes the chip row's space so the composer doesn't jump.
 */
const THINKING_WORDS = ["Analyzing…", "Proposing…", "Composing…"] as const
const THINKING_WORD_MS = 900
function SuggestionRow({
  suggestions,
  status,
  pressed,
  onChip,
}: {
  suggestions: string[]
  status: "idle" | "loading" | "ready" | "error"
  pressed: number | null
  onChip: (text: string, idx: number) => void
}) {
  // `dismissed` hides the previous chip set the instant the user clicks one,
  // so chips don't linger awkwardly through the agent's stream. Cleared when
  // a fresh "ready" status lands. Also flipped true on every loading
  // transition so the chip → thinking pill animation always plays.
  const [dismissed, setDismissed] = useState(false)
  // Bumps each time a new ready set arrives — keys the stagger animation so
  // it replays even when an old set re-orders into identical strings.
  const [revealKey, setRevealKey] = useState(0)
  // Rotating word inside the "thinking" pill. Lives in component state so
  // each new loading window starts fresh at the first word.
  const [wordIdx, setWordIdx] = useState(0)

  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      if (status === "loading") setDismissed(true)
      else if (status === "ready") {
        setDismissed(false)
        setRevealKey((k) => k + 1)
        setWordIdx(0)
      } else if (status === "error" || status === "idle") {
        setDismissed(false)
      }
      prevStatusRef.current = status
    }
  }, [status])

  // Cycle the thinking word while loading. Reset to first word on each
  // loading entry so the user always sees "Analyzing…" first.
  useEffect(() => {
    if (status !== "loading") return
    const id = window.setInterval(() => {
      setWordIdx((i) => (i + 1) % THINKING_WORDS.length)
    }, THINKING_WORD_MS)
    return () => window.clearInterval(id)
  }, [status])

  const handleClick = (s: string, i: number) => {
    setDismissed(true)
    onChip(s, i)
  }

  // First-ever load with no chips yet: thin shimmer bar holds the space.
  if (status === "loading" && suggestions.length === 0 && !dismissed) {
    return (
      <div className="sugg-row sugg-row--loading" aria-busy="true">
        <span className="sugg-skel" />
      </div>
    )
  }

  // Thinking pill: shown while Haiku is regenerating (we already had chips,
  // or the user dismissed them by clicking).
  if (status === "loading") {
    return (
      <div className="sugg-row sugg-row--thinking" aria-busy="true" aria-live="polite">
        <span className="sugg-thinking">
          <span className="sugg-thinking-dot" />
          <span className="sugg-thinking-word" key={wordIdx}>
            {THINKING_WORDS[wordIdx]}
          </span>
        </span>
      </div>
    )
  }

  // Dismissed mid-turn (status hasn't become "loading" yet because the
  // orchestrator pauses regeneration while the assistant streams). Collapse.
  if (dismissed) return null

  if (status !== "ready" || suggestions.length === 0) return null

  return (
    <div className="sugg-row sugg-row--ready" key={revealKey}>
      {suggestions.map((s, i) => (
        <button
          key={`${i}-${s}`}
          type="button"
          className={`sugg sugg--reveal${pressed === i ? " pressed" : ""}`}
          style={{ ["--sugg-i" as string]: i }}
          onClick={() => handleClick(s, i)}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function lastTimerAnchor(parts: AgentTurn["parts"]): number {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i]
    if (p.kind === "tool") return p.tool.startedAt
    if (p.kind === "instance") {
      const nested = lastTimerAnchor(p.children)
      // children may be empty — only return if the recursive walk found a tool
      // (otherwise it returned Date.now() which would shadow earlier siblings).
      if (p.children.some((c) => c.kind === "tool" || c.kind === "instance")) {
        return nested
      }
    }
  }
  return Date.now()
}

export function Agent({
  mode,
  model,
  messages,
  timeline,
  railActive,
  input,
  pressed,
  suggestions,
  suggestionsStatus,
  emptyState,
  onChip,
  onInput,
  onSend,
}: {
  mode: Mode
  model: string
  messages: ChatMessage[]
  timeline: Timeline
  railActive: boolean
  input: string
  pressed: number | null
  suggestions: string[]
  /** Drives the chip-row UX while Haiku regenerates. See `useDynamicSuggestions`. */
  suggestionsStatus: "idle" | "loading" | "ready" | "error"
  emptyState: string
  onChip: (text: string, idx: number) => void
  onInput: (text: string) => void
  onSend: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // Sticky-bottom follow: auto-scroll only when the user is already pinned to
  // the bottom. Scrolling up releases the lock so the user can read earlier
  // turns mid-stream; scrolling back to the bottom re-arms it. Without this
  // guard, every streamed chunk yanked the viewport back down.
  const stickToBottomRef = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger
  useEffect(() => {
    const el = bodyRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])
  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    // 32px slack absorbs sub-pixel rounding and the trailing scroll the
    // auto-pin itself triggers, so the lock survives normal streaming.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom <= 32
  }

  // Gently invite input if the composer sits untouched for >5.5s and is empty.
  const [invite, setInvite] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length intentional
  useEffect(() => {
    setInvite(false)
    if (input.trim()) return
    const id = window.setTimeout(() => setInvite(true), 5500)
    return () => window.clearTimeout(id)
  }, [input, messages.length])

  const showRail = mode === "agentic" && railActive

  return (
    <section className="panel p-agent agent">
      <header className="panel-head agent-head">
        <Icon name="spark" size={15} style={{ color: "var(--neutral-400)" }} />
        <span className="panel-title">Agent</span>
        <span className="spacer" />
        <span className="chip-row">
          <span className="mode-chip">
            <Icon name={mode === "agentic" ? "network" : "plug"} size={12} />
            {mode === "agentic" ? "Agentic flow" : "Data flow"}
          </span>
          <span className="model-chip">
            <Icon name="cpu" size={11} />
            {model}
          </span>
        </span>
      </header>

      <div className="agent-stage">
        <aside className={`rail${showRail ? "" : " hidden"}`}>
          {NODES.map((n, i) => {
            const node = timeline[n.k]
            const st = node.status
            return (
              <span key={n.k} style={{ display: "contents" }}>
                <div
                  className={`rail-node ${st === "exec" ? "exec" : st === "done" ? "done" : ""}`}
                >
                  <span className="rail-ic">
                    <Icon name={n.ic} size={14} />
                    <span className="lab">
                      {n.lab}
                      {node.count > 1 ? ` ×${node.count}` : ""}
                    </span>
                  </span>
                  {node.count > 1 && (
                    <span className="rail-count" title={`${node.count} dispatches`}>
                      {node.count}
                    </span>
                  )}
                </div>
                {i < NODES.length - 1 && (
                  <span className={`rail-link${st === "done" ? " done" : ""}`} />
                )}
              </span>
            )
          })}
        </aside>

        <div className="chat">
          <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <span className="agent-ava lg">
                  <img src="/assets/glyph-w.svg" alt="" />
                </span>
                <p>{emptyState}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <AgentMessage key={m.uid != null ? m.uid : `m${i}`} m={m} />
            ))}
          </div>

          <div className="composer">
            <SuggestionRow
              suggestions={suggestions}
              status={suggestionsStatus}
              pressed={pressed}
              onChip={onChip}
            />
            <div className={`composer-input${invite ? " invite" : ""}`}>
              <input
                value={input}
                placeholder="Ask the agent…"
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) onSend()
                }}
              />
              {input.trim() && (
                <button
                  type="button"
                  className="send-btn active"
                  onClick={onSend}
                  aria-label="Send"
                >
                  <Icon name="send" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
