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
 * An agent turn is a chronological sequence of parts emitted by the model.
 * Within one turn the order is given by the stream (one content block at a
 * time); across the client-side tool loop the order is preserved by simply
 * appending new parts in the order events arrive. This is the only way to
 * render tool calls and text in the same order the model produced them.
 */
export type AgentPart =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; tool: ToolEntry }

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
