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
  callbacks: ModeACallbacks
}

export async function runModeA(opts: ModeARunOptions): Promise<void> {
  const { query, cancelRef, callbacks } = opts

  const res = await fetch("/api/demo/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "agentic",
      messages: [{ role: "user", content: query }],
    }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Mode A failed: ${res.status} ${res.statusText}`)
  }

  // Item-id of the currently-open text scope, and the author decoded from it.
  // We need the author at text-delta time, and text-delta only carries the
  // item id back-reference — so we resolve and cache it on text-start.
  const authorByItemId = new Map<string, AgentAuthor>()

  try {
    for await (const chunk of readUiMessageChunks(res.body)) {
      if (cancelRef.current) break
      const type = chunk.type as string | undefined
      switch (type) {
        case "text-start": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          if (id) authorByItemId.set(id, decodeAuthor(id))
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
          if (id) authorByItemId.delete(id)
          break
        }
        case "data-toolCall": {
          const data = chunk.data as
            | { id?: string; name?: string; args?: unknown; author?: string }
            | undefined
          if (!data?.name) break
          const argsObj =
            data.args && typeof data.args === "object"
              ? (data.args as Record<string, unknown>)
              : null
          const author =
            data.author && KNOWN_AUTHORS.has(data.author as AgentAuthor)
              ? (data.author as AgentAuthor)
              : null
          callbacks.onToolCall(data.id ?? null, data.name, argsObj, author)
          break
        }
        case "data-subagent": {
          const data = chunk.data as { agentId?: string; name?: string } | undefined
          const raw = data?.name ?? data?.agentId ?? ""
          const bare = raw.replace(/^subagent-/, "")
          if (!bare) break
          callbacks.onSubagentSeen(bare)
          if (KNOWN_AUTHORS.has(bare as AgentAuthor) && bare !== "main") {
            callbacks.onSubagentStart(bare as AgentAuthor)
          }
          break
        }
        case "data-subagent-end":
          callbacks.onSubagentEnd()
          break
        case "data-toolResult": {
          const data = chunk.data as { id?: string; name?: string } | undefined
          const toolUseId = data?.id ?? null
          if (!toolUseId) break
          callbacks.onToolResult(toolUseId, data?.name ?? null)
          break
        }
        case "data-jobId": {
          const data = chunk.data as { jobId?: number } | undefined
          if (typeof data?.jobId === "number" && Number.isFinite(data.jobId)) {
            callbacks.onJobId(data.jobId)
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
            callbacks.onCostBreakdown(data.jobId, data.costBreakdown)
          }
          break
        }
        case "finish":
          callbacks.onFinish()
          break
        case "error":
          throw new Error(String(chunk.errorText ?? "stream error"))
        default:
          break
      }
    }
  } finally {
    callbacks.onStreamEnd()
  }
}
