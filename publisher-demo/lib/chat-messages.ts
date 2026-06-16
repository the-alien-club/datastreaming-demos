/**
 * Shared message types between DemoApp (state owner) and the Agent panel
 * (renderer). Three flavours:
 *
 *   - user     plain bubble on the right
 *   - agent    the assistant turn; carries the tool cards, the synthesis
 *              text, the optional chain-of-thought from Agentic flow
 *   - scope    transient inline notice (e.g. "Configuration updated · applying…")
 */

export interface ToolEntry {
  /** SDK tool_use_id; lets the orchestrator patch the right entry when the
   * tool result event lands later in the stream. */
  toolUseId: string | null
  /** Icon name from components/icons.tsx; "search" / "plug" / "file" all work. */
  icon: string
  /** Resolved tool name (e.g. `datacluster_keyword_search`). */
  name: string
  /** Short single-line description used in the collapsed card header. */
  summary: string
  /** JSON-stringified args, rendered in a <pre> block on expand. */
  args: string
  /** Free-form result preview shown on expand. */
  result: string
  /** True from tool-use-start until tool-result lands. Drives the spinner. */
  running: boolean
  /** Date.now() when the call dispatched — fuels the live elapsed timer. */
  startedAt: number
}

/**
 * Canonical agent types the renderer styles natively. The platform may
 * dispatch other custom subagents; those fall through to `"other"` and pick
 * up the generic styling.
 *
 * - `main`        the orchestrator (always exactly one per turn — its text
 *                 and tools live at the root of the agent message)
 * - `planner`/`specialist`/`critic`  the three workflow stages in the demo
 *                 prompt. Multiple *instances* of each may exist within a
 *                 turn (e.g. one specialist per planner-emitted task).
 * - `other`       any other configured subagent name — rendered with the
 *                 generic card style and labeled with `displayName`.
 *
 * Kept as an alias `AgentAuthor` for callers that still think in role terms.
 */
export type AgentType = "main" | "planner" | "specialist" | "critic" | "other"
export type AgentAuthor = AgentType

/**
 * Per-dispatch instance identity. One `agent-instance` part is opened per
 * unique `instanceKey` the stream surfaces; text and tool cards emitted by
 * that dispatch nest inside `children`. Two parallel specialists carry
 * different `instanceKey` values (e.g. `subagent-specialist#aaa…` and
 * `subagent-specialist#bbb…`) and therefore get separate cards — so the
 * stream events for each never collide visually.
 */
export interface AgentInstanceInfo {
  /** `<agentType>` or `<agentType>#<dispatchId>` — the grouping key. */
  instanceKey: string
  /** Raw registry id from the platform (`MAIN`, `subagent-planner`, …). */
  agentType: string
  /** Canonical class used by the renderer for styling + iconography. */
  canonicalType: AgentType
  /** Human label from `x_alien_agent_registry` (falls back to `agentType`). */
  displayName: string
  /** `subagent` for everything dispatched by an orchestrator; `tool` for MCP
   *  agents; `main` reserved for the root. */
  kind: "main" | "subagent" | "tool"
}

/**
 * An agent turn is a chronological sequence of parts emitted by the model.
 * Within one turn the order is given by the stream (one content block at a
 * time); across the client-side tool loop the order is preserved by simply
 * appending new parts in the order events arrive. This is the only way to
 * render tool calls and text in the same order the model produced them.
 *
 * Mode A interleaves MAIN-level parts (root text / root tool) with
 * per-dispatch *instance* containers — one for every unique subagent
 * dispatch surfaced by the stream. Mode B has no instances; its text and
 * tools sit flat at the root.
 */
export type AgentPart =
  | { kind: "text"; text: string; author?: AgentAuthor }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; tool: ToolEntry }
  | {
      kind: "instance"
      /** Stable per-dispatch key. Two specialist dispatches in parallel have
       *  different instanceKeys → distinct cards. */
      instanceKey: string
      /** Canonical class for styling. */
      canonicalType: AgentType
      /** Raw registry id; useful as a fallback label and a debug breadcrumb. */
      agentType: string
      /** Title shown in the card header. */
      displayName: string
      /** Per-type index (1-based). When a workflow runs two planners, the
       *  second card shows `Planner #2`. Computed at insertion time. */
      ordinal: number
      status: "running" | "done"
      /** Everything emitted by this dispatch — text, tools, and any nested
       *  parts in the order they arrived. Nesting is one level deep in this
       *  workflow (subagents don't open sub-subagents on stream), but the
       *  shape supports it. */
      children: AgentPart[]
    }

export interface AgentTurn {
  uid: number
  role: "agent"
  sender: string
  /** Chronological parts (text / thinking / tool). Render in this exact
   * order so interleaving is preserved. */
  parts: AgentPart[]
  streaming: boolean
  faded?: boolean
  fresh: boolean
  chain?: { who: string; text: string }[]
}

export interface UserTurn {
  uid: number
  role: "user"
  text: string
}

export interface ScopeNotice {
  uid: number
  role: "scope"
  text: string
}

export type ChatMessage = UserTurn | AgentTurn | ScopeNotice
