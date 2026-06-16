/**
 * Mode A — Agentic flow stream consumer.
 *
 * Talks to `/api/demo/chat` with `mode: "agentic"`, reads the AI SDK
 * `UIMessageChunk` stream emitted by `lib/platform/responses_stream.ts`, and
 * forwards a narrow callback surface to the orchestrator hook.
 *
 * The platform's Responses-API stream gives us per-dispatch agent identity
 * via composite item-ids of the form:
 *
 *     agent:<agentType>::<kind>_<ordinal>                       # MAIN
 *     agent:<agentType>#<dispatchId>::<kind>_<ordinal>          # subagents
 *
 * `dispatchId` is a per-`task()` UUID — two parallel `specialist` dispatches
 * carry different dispatchIds and therefore different `instanceKey`s. The
 * client uses `instanceKey` as the grouping key so each dispatch gets its own
 * card in the UI and stream events for distinct instances never collide.
 *
 * The server-side translator (`responses_stream.ts`) tags every
 * `data-toolCall` / `data-toolResult` with the dispatching instance, emits
 * `data-instance` the first time a new instanceKey is seen, and forwards
 * `data-agentRegistry` once at the top of the stream so the client knows the
 * human display names for each registered agent. Text events come through
 * with the raw item-id; we parse it locally with `parseAgentItemId` to derive
 * the instance.
 *
 * Mode A here cannot break Mode B — they share no client state; their two
 * `run.ts` files write into the same orchestrator hook via separate callback
 * surfaces.
 */
import type { AgentInstanceInfo, AgentType } from "@/lib/chat-messages"
import { readUiMessageChunks } from "@/lib/ui-stream"

/** Parsed composite agent item-id. */
export interface ParsedAgentItemId {
  agentType: string
  dispatchId: string | null
  instanceKey: string
  kind: string
  ordinal: number
}

/**
 * Parse `agent:<type>[#<dispatchId>]::<kind>_<n>`. `#` is reserved — no
 * configured subagent name contains it, so the split is unambiguous. Returns
 * `null` for ids that don't conform (the renderer drops those at the root).
 */
export function parseAgentItemId(itemId: string | null | undefined): ParsedAgentItemId | null {
  if (!itemId) return null
  const m = itemId.match(/^agent:([^#:]+)(?:#([^:]+))?::([^_]+)_(\d+)$/)
  if (!m) return null
  const [, agentType, dispatchId, kind, ordinalStr] = m
  const instanceKey = dispatchId ? `${agentType}#${dispatchId}` : agentType
  return {
    agentType,
    dispatchId: dispatchId ?? null,
    instanceKey,
    kind,
    ordinal: Number(ordinalStr),
  }
}

/**
 * Reduce a raw registry id to the canonical class the renderer styles. Any
 * subagent the workflow author named outside the known triple lands in
 * `"other"` and renders with the generic card.
 */
export function canonicalAgentType(rawType: string): AgentType {
  if (rawType === "MAIN") return "main"
  const bare = rawType.replace(/^subagent-/, "")
  if (bare === "planner" || bare === "specialist" || bare === "critic") return bare
  return "other"
}

/** One entry in `metadata.x_alien_agent_registry`. Forwarded verbatim from
 *  the server-side translator. */
export interface AgentRegistryEntry {
  id: string
  kind: "main" | "subagent" | "tool"
  name: string
  parent_id: string | null
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
  /** Platform's registered agents. Fires once on `response.created` so the
   *  hook can resolve display names without parsing items each time. May be
   *  truncated (see `x_alien_registry_truncated`); the per-item composite id
   *  remains authoritative for type + dispatchId. */
  onAgentRegistry: (entries: AgentRegistryEntry[]) => void
  /** First sighting of a new per-dispatch instance. The hook opens a fresh
   *  per-dispatch card; subsequent text/tool events for the same
   *  `instanceKey` route into that card. Idempotent — only fires once per
   *  unique `instanceKey`. */
  onInstance: (info: AgentInstanceInfo) => void
  /** A text-delta arrived. `instance` is null when the item-id couldn't be
   *  parsed OR resolves to MAIN — in both cases the text lands at the root. */
  onAuthorText: (delta: string, instance: AgentInstanceInfo | null) => void
  /** A tool dispatch landed. `instance` is null when the tool was issued by
   *  MAIN (rare in this workflow). `args` may be null when args weren't
   *  resolved on the AI SDK fullStream side. */
  onToolCall: (
    toolUseId: string | null,
    toolName: string,
    args: Record<string, unknown> | null,
    instance: AgentInstanceInfo | null,
  ) => void
  /** Pair-event for a previously-dispatched tool. Mode A has no result body
   *  — the hook resolves attribution from its own dispatch ref. */
  onToolResult: (toolUseId: string, fallbackName?: string | null) => void
  /** Job-id correlation from `Response.metadata.x_alien_job_id`. Fires once
   *  per turn, on `response.created`. */
  onJobId: (jobId: number) => void
  /** Platform `response_id` for this turn. The hook stashes it as
   *  `previousResponseId` for the NEXT turn so multi-turn memory threads. */
  onResponseId: (responseId: string) => void
  /** Platform-assembled per-job cost breakdown. Arrives just before the
   *  terminal frame. */
  onCostBreakdown: (jobId: number, breakdown: CostBreakdownPayload) => void
  /** Platform emitted `finish`. Clean settle. */
  onFinish: () => void
  /** Stream ended (clean or otherwise). Defensive settle. */
  onStreamEnd: () => void
}

export interface ModeARunOptions {
  query: string
  cancelRef: { readonly current: boolean }
  previousResponseId?: string | null
  callbacks: ModeACallbacks
}

export async function runModeA(opts: ModeARunOptions): Promise<void> {
  const { query, cancelRef, previousResponseId, callbacks } = opts

  const tStart = Date.now()
  const ms = () => `${Date.now() - tStart}ms`
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

  // Registry of agent display names from the platform. Server forwards this
  // via `data-agentRegistry` on response.created. We also build instance
  // metadata on demand from item-id parses when the registry is silent (e.g.
  // truncated past 512 bytes — the spec calls this out).
  const registry = new Map<string, AgentRegistryEntry>()
  /** Cached `instanceKey → AgentInstanceInfo` so we don't repeatedly resolve. */
  const instanceCache = new Map<string, AgentInstanceInfo>()
  /** Per-canonicalType ordinal counter for `Specialist #1`, `#2`, … labels. */
  const ordinalByCanonical = new Map<AgentType, number>()
  /** Tool-id → instance, so the result-side handler doesn't need to re-parse.
   *  Server now passes `instanceKey` on both call + result events, but we
   *  cache here too for the no-op fallback path. */
  const instanceByToolId = new Map<string, AgentInstanceInfo>()

  function resolveInstance(itemId: string | null | undefined): AgentInstanceInfo | null {
    const parsed = parseAgentItemId(itemId)
    if (!parsed) return null
    if (parsed.agentType === "MAIN") return null
    const cached = instanceCache.get(parsed.instanceKey)
    if (cached) return cached
    const entry = registry.get(parsed.agentType)
    const canonical = canonicalAgentType(parsed.agentType)
    const info: AgentInstanceInfo = {
      instanceKey: parsed.instanceKey,
      agentType: parsed.agentType,
      canonicalType: canonical,
      displayName: entry?.name ?? parsed.agentType,
      kind: entry?.kind ?? "subagent",
    }
    instanceCache.set(parsed.instanceKey, info)
    return info
  }

  /** Idempotent: announces a new instance the first time we route through it. */
  function ensureInstance(info: AgentInstanceInfo | null): AgentInstanceInfo | null {
    if (!info) return null
    if (!instanceCache.has(info.instanceKey)) {
      instanceCache.set(info.instanceKey, info)
    }
    // Track ordinal so the renderer can label `Specialist #2` when a second
    // dispatch of the same canonical type lands.
    const seen = ordinalByCanonical.get(info.canonicalType) ?? 0
    if (!instanceWasAnnounced.has(info.instanceKey)) {
      ordinalByCanonical.set(info.canonicalType, seen + 1)
      instanceWasAnnounced.add(info.instanceKey)
      callbacks.onInstance(info)
    }
    return info
  }
  const instanceWasAnnounced = new Set<string>()

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
          const info = resolveInstance(id)
          // Announce the instance up front so the card appears even before
          // its first text-delta. Lets the UI render a placeholder
          // ("Specialist starting up…") rather than dead air.
          if (info) ensureInstance(info)
          console.log(
            `[mode-a client] text-start id=${id} → instance=${info?.instanceKey ?? "MAIN"}`,
          )
          break
        }
        case "text-delta": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          const delta = typeof chunk.delta === "string" ? chunk.delta : ""
          if (!delta) break
          const info = resolveInstance(id)
          if (info) ensureInstance(info)
          callbacks.onAuthorText(delta, info)
          break
        }
        case "text-end": {
          const id = typeof chunk.id === "string" ? chunk.id : null
          if (id) console.log(`[mode-a client] text-end id=${id}`)
          break
        }
        case "data-agentRegistry": {
          const data = chunk.data as { entries?: AgentRegistryEntry[] } | undefined
          if (Array.isArray(data?.entries)) {
            for (const e of data.entries) registry.set(e.id, e)
            console.log(`[mode-a client] data-agentRegistry entries=${data.entries.length}`)
            callbacks.onAgentRegistry(data.entries)
          }
          break
        }
        case "data-instance": {
          const data = chunk.data as
            | {
                instanceKey?: string
                agentType?: string
                canonicalType?: AgentType
                displayName?: string
                kind?: "main" | "subagent" | "tool"
              }
            | undefined
          if (!data?.instanceKey || !data.agentType) {
            console.warn(`[mode-a client] ⚠ data-instance missing fields, skipped:`, data)
            break
          }
          const info: AgentInstanceInfo = {
            instanceKey: data.instanceKey,
            agentType: data.agentType,
            canonicalType: data.canonicalType ?? canonicalAgentType(data.agentType),
            displayName: data.displayName ?? data.agentType,
            kind: data.kind ?? "subagent",
          }
          ensureInstance(info)
          break
        }
        case "data-toolCall": {
          const data = chunk.data as
            | {
                id?: string
                name?: string
                args?: unknown
                instanceKey?: string
                agentType?: string
                displayName?: string
              }
            | undefined
          if (!data?.name) {
            console.warn(`[mode-a client] ⚠ data-toolCall with no name, skipped:`, data)
            break
          }
          const argsObj =
            data.args && typeof data.args === "object"
              ? (data.args as Record<string, unknown>)
              : null
          let info: AgentInstanceInfo | null = null
          if (data.instanceKey) {
            info = {
              instanceKey: data.instanceKey,
              agentType: data.agentType ?? data.instanceKey.split("#")[0] ?? "unknown",
              canonicalType: canonicalAgentType(
                data.agentType ?? data.instanceKey.split("#")[0] ?? "",
              ),
              displayName: data.displayName ?? data.agentType ?? data.instanceKey,
              kind: "subagent",
            }
            info = ensureInstance(info)
          }
          if (data.id && info) instanceByToolId.set(data.id, info)
          console.log(
            `[mode-a client] data-toolCall id=${data.id} tool=${data.name} instance=${info?.instanceKey ?? "—"} args=${argsObj ? JSON.stringify(argsObj).slice(0, 120) : "null"}`,
          )
          callbacks.onToolCall(data.id ?? null, data.name, argsObj, info)
          break
        }
        case "data-toolResult": {
          const data = chunk.data as
            | { id?: string; name?: string; status?: string; instanceKey?: string }
            | undefined
          const toolUseId = data?.id ?? null
          if (!toolUseId) {
            console.warn(`[mode-a client] ⚠ data-toolResult with no id, skipped:`, data)
            break
          }
          console.log(
            `[mode-a client] data-toolResult id=${toolUseId} tool=${data?.name ?? "—"} instance=${data?.instanceKey ?? "—"} status=${data?.status ?? "—"}`,
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
