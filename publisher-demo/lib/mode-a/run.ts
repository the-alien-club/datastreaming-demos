/**
 * Mode A — Agentic flow stream consumer.
 *
 * Talks to `/api/demo/chat` with `mode: "agentic"`, reads the AI SDK
 * `UIMessageChunk` stream emitted by our `responses_stream.ts` translator,
 * and dispatches a narrow callback surface back into the orchestrator hook.
 *
 * The platform's Responses-API stream interleaves four kinds of events that
 * need to be threaded into the message bubble *in chronological order*:
 *
 *   - text-start / text-delta / text-end  ← scoped to one *item-id* like
 *       `agent:MAIN::msg_25` or `agent:subagent-planner::msg_2`. We decode
 *       the role from the item-id and tell the hook which subagent authored
 *       each piece of text. The hook decides how to render each author.
 *   - data-subagent / data-subagent-end    ← MAIN dispatched a sub-role.
 *       Surfaced as a chronological banner in the message bubble (a Specialist
 *       chip lives BETWEEN the planner's notes and the resulting tool calls).
 *   - data-toolCall / data-toolResult     ← unchanged; the hook owns the
 *       dispatch ref and royalty cascade.
 *   - finish                              ← end of turn.
 *
 * All shared hook state (message tree, dispatch ref, royalty pipeline,
 * event bus) is reached only via the callbacks. Editing Mode A here cannot
 * break Mode B.
 */
import type { AgentAuthor } from "@/lib/chat-messages"
import { readUiMessageChunks } from "@/lib/ui-stream"

const KNOWN_AUTHORS: ReadonlySet<AgentAuthor> = new Set(["main", "planner", "specialist", "critic"])

/** Decode the agent role from a platform item id like
 * `agent:MAIN::msg_4` or `agent:subagent-specialist::fc_7`. Falls back to
 * `"main"` so the renderer always has a usable author. */
function decodeAuthor(itemId: string | undefined): AgentAuthor {
  if (!itemId) return "main"
  const m = itemId.match(/^agent:([^:]+)::/)
  if (!m) return "main"
  const raw = m[1] ?? ""
  if (raw === "MAIN") return "main"
  const bare = raw.replace(/^subagent-/, "")
  return (KNOWN_AUTHORS.has(bare as AgentAuthor) ? bare : "main") as AgentAuthor
}

/** One row of the platform's per-job cost breakdown. Mirrors the backend's
 * `CostBrick` (web-app/packages/backend/lib/cost_breakdown_types.ts). Fields
 * left untyped (`units: Record<string, unknown>`) so future categories can
 * extend the shape without a client schema bump. */
export interface CostBrick {
  id: string
  category: "llm" | "compute" | "connector" | "dataset" | "platform"
  node_id: string
  parent_brick_id: string | null
  cost_eur: number
  units?: Record<string, unknown>
}

/** Per-job cost breakdown payload arriving on `data-costBreakdown`. */
export interface CostBreakdownPayload {
  status: "complete" | "partial" | "pending" | "unavailable"
  schema_version: number
  reconciliation_delta_eur: number
  bricks: CostBrick[]
}

export interface ModeACallbacks {
  /** A run of text-delta arrived for `author`. The hook appends to the most
   * recent text part of that author, or opens a new one. */
  onAuthorText: (author: AgentAuthor, delta: string) => void
  /** Platform announced a new active subagent. The hook appends a chronological
   * banner part with `status: "running"`. */
  onSubagentStart: (name: AgentAuthor) => void
  /** Platform closed the active subagent. The hook flips the last open
   * banner to `status: "done"`. */
  onSubagentEnd: () => void
  /** A new tool call was dispatched. `author` is the subagent that issued
   * the call (decoded from the platform-side function_call item id) so the
   * UI can nest the card under the right role's block. `args` may be null
   * when args weren't streamed. */
  onToolCall: (
    toolUseId: string | null,
    toolName: string,
    args: Record<string, unknown> | null,
    author: AgentAuthor | null,
  ) => void
  /** A previously-dispatched tool finished. Mode A has no result body — the
   * hook resolves attribution from the dispatch ref alone. */
  onToolResult: (toolUseId: string, fallbackName?: string | null) => void
  /** Platform `data-subagent` event with bare role name. The hook advances the
   * left rail timeline monotonically. */
  onSubagentSeen: (name: string) => void
  /** Backend Job id correlation extracted from `Response.metadata.x_alien_job_id`.
   * Fires once per turn, on `response.created`. Lets the hook reach back to
   * `GET /jobs/:id` for retries / diagnostics. */
  onJobId: (jobId: number) => void
  /** Platform-assigned `response_id` for this turn. Fires once on
   * `response.created`. The hook stashes it as `previousResponseId` for the
   * NEXT turn so the orchestrator threads multi-turn memory. */
  onResponseId: (responseId: string) => void
  /** Platform-assembled per-job cost breakdown, arrives immediately before
   * the terminal frame. The hook walks the bricks to surface per-connector
   * and per-dataset royalty attribution on the observability tape. */
  onCostBreakdown: (jobId: number, breakdown: CostBreakdownPayload) => void
  /** Platform stream emitted `finish`. Clear streaming, settle the rail. */
  onFinish: () => void
  /** Defensive: stream ended (with or without `finish`). Clear streaming. */
  onStreamEnd: () => void
}

export interface ModeARunOptions {
  query: string
  /** Ref the orchestrator polls externally (Reset / mode switch). */
  cancelRef: { readonly current: boolean }
  /** Platform `response_id` from the previous turn in this chat session.
   * `null`/`undefined` on the first turn or after a reset. Forwarded
   * server-side as `providerOptions.openai.previousResponseId`. */
  previousResponseId?: string | null
  callbacks: ModeACallbacks
}

export async function runModeA(opts: ModeARunOptions): Promise<void> {
  const { query, cancelRef, previousResponseId, callbacks } = opts

  const tStart = Date.now()
  const ms = () => `${Date.now() - tStart}ms`
  // Per-chunk-type counters dumped at end-of-turn so it's easy to confirm "I
  // got 13 tool calls, 13 results, 1 cost breakdown, 1 finish".
  const counts: Record<string, number> = {}
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1
  }
  console.log(
    `[mode-a client] ▶ runModeA start queryLen=${query.length} previousResponseId=${previousResponseId ?? "—"}`,
  )

  let res: Response
  try {
    res = await fetch("/api/demo/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "agentic",
        messages: [{ role: "user", content: query }],
        ...(previousResponseId ? { previousResponseId } : {}),
      }),
    })
  } catch (err) {
    console.error(`[mode-a client] ✗ fetch threw after ${ms()}:`, err)
    callbacks.onStreamEnd()
    throw err
  }
  console.log(
    `[mode-a client]   POST /api/demo/chat → ${res.status} ${res.statusText} (after ${ms()})`,
  )
  if (!res.ok || !res.body) {
    callbacks.onStreamEnd()
    throw new Error(`Mode A failed: ${res.status} ${res.statusText}`)
  }

  // Item-id of the currently-open text scope, and the author decoded from it.
  // We need the author at text-delta time, and text-delta only carries the
  // item id back-reference — so we resolve and cache it on text-start.
  const authorByItemId = new Map<string, AgentAuthor>()

  try {
    for await (const chunk of readUiMessageChunks(res.body)) {
      if (cancelRef.current) {
        console.warn(`[mode-a client] ⚠ cancelRef tripped after ${ms()} — aborting loop`)
        break
      }
      const type = chunk.type as string | undefined
      if (type) bump(type)
      switch (type) {
        case "start":
          console.log(`[mode-a client] start (${ms()})`)
          break
        case "text-start": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          if (id) {
            const author = decodeAuthor(id)
            authorByItemId.set(id, author)
            console.log(`[mode-a client] text-start id=${id} → author=${author}`)
          }
          break
        }
        case "text-delta": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          const delta = typeof chunk.delta === "string" ? chunk.delta : ""
          if (!delta) break
          const author = id ? (authorByItemId.get(id) ?? decodeAuthor(id)) : "main"
          callbacks.onAuthorText(author, delta)
          break
        }
        case "text-end": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          if (id) {
            const author = authorByItemId.get(id) ?? "?"
            console.log(`[mode-a client] text-end id=${id} (author=${author})`)
            authorByItemId.delete(id)
          }
          break
        }
        case "data-toolCall": {
          const data = chunk.data as
            | { id?: string; name?: string; args?: unknown; author?: string }
            | undefined
          if (!data?.name) {
            console.warn(`[mode-a client] ⚠ data-toolCall with no name, skipped:`, data)
            break
          }
          const argsObj =
            data.args && typeof data.args === "object"
              ? (data.args as Record<string, unknown>)
              : null
          const author =
            data.author && KNOWN_AUTHORS.has(data.author as AgentAuthor)
              ? (data.author as AgentAuthor)
              : null
          console.log(
            `[mode-a client] data-toolCall id=${data.id} tool=${data.name} author=${author ?? "—"} args=${argsObj ? JSON.stringify(argsObj).slice(0, 120) : "null"}`,
          )
          callbacks.onToolCall(data.id ?? null, data.name, argsObj, author)
          break
        }
        case "data-subagent": {
          const data = chunk.data as { agentId?: string; name?: string } | undefined
          const raw = data?.name ?? data?.agentId ?? ""
          const bare = raw.replace(/^subagent-/, "")
          if (!bare) {
            console.warn(`[mode-a client] ⚠ data-subagent with no name, skipped:`, data)
            break
          }
          console.log(`[mode-a client] data-subagent ${raw} → bare=${bare}`)
          callbacks.onSubagentSeen(bare)
          if (KNOWN_AUTHORS.has(bare as AgentAuthor) && bare !== "main") {
            callbacks.onSubagentStart(bare as AgentAuthor)
          }
          break
        }
        case "data-subagent-end":
          console.log(`[mode-a client] data-subagent-end`)
          callbacks.onSubagentEnd()
          break
        case "data-toolResult": {
          const data = chunk.data as
            | { id?: string; name?: string; status?: string; author?: string }
            | undefined
          const toolUseId = data?.id ?? null
          if (!toolUseId) {
            console.warn(`[mode-a client] ⚠ data-toolResult with no id, skipped:`, data)
            break
          }
          console.log(
            `[mode-a client] data-toolResult id=${toolUseId} tool=${data?.name ?? "—"} status=${data?.status ?? "—"} author=${data?.author ?? "—"}`,
          )
          callbacks.onToolResult(toolUseId, data?.name ?? null)
          break
        }
        case "data-jobId": {
          const data = chunk.data as { jobId?: number } | undefined
          if (typeof data?.jobId === "number" && Number.isFinite(data.jobId)) {
            console.log(`[mode-a client] data-jobId ${data.jobId}`)
            callbacks.onJobId(data.jobId)
          }
          break
        }
        case "data-responseId": {
          const data = chunk.data as { responseId?: string } | undefined
          if (typeof data?.responseId === "string" && data.responseId.length > 0) {
            console.log(`[mode-a client] data-responseId ${data.responseId}`)
            callbacks.onResponseId(data.responseId)
          }
          break
        }
        case "data-costBreakdown": {
          const data = chunk.data as
            | { jobId?: number; costBreakdown?: CostBreakdownPayload }
            | undefined
          if (
            typeof data?.jobId === "number" &&
            data.costBreakdown &&
            Array.isArray(data.costBreakdown.bricks)
          ) {
            const cb = data.costBreakdown
            const totalEur = cb.bricks.reduce((s, b) => s + (b.cost_eur || 0), 0)
            console.log(
              `[mode-a client] data-costBreakdown jobId=${data.jobId} status=${cb.status} bricks=${cb.bricks.length} totalEur=${totalEur.toFixed(4)}`,
            )
            for (const b of cb.bricks) {
              console.log(
                `[mode-a client]   brick ${b.id} category=${b.category} node=${b.node_id} parent=${b.parent_brick_id ?? "—"} eur=${b.cost_eur} units=${b.units ? JSON.stringify(b.units) : "—"}`,
              )
            }
            callbacks.onCostBreakdown(data.jobId, cb)
          } else {
            console.warn(`[mode-a client] ⚠ data-costBreakdown malformed:`, data)
          }
          break
        }
        case "finish":
          console.log(
            `[mode-a client] finish reason=${(chunk as { finishReason?: string }).finishReason} (after ${ms()})`,
          )
          callbacks.onFinish()
          break
        case "finish-step":
          console.log(`[mode-a client] finish-step`)
          break
        case "error":
          console.error(`[mode-a client] ✗ error chunk:`, chunk)
          throw new Error(String(chunk.errorText ?? "stream error"))
        default:
          if (type) {
            console.log(`[mode-a client] (uncategorized chunk) type=${type}`, chunk)
          }
          break
      }
    }
  } finally {
    const tally = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")
    console.log(`[mode-a client] ◀ runModeA done total=${ms()} chunks: ${tally}`)
    callbacks.onStreamEnd()
  }
}
