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
}

export interface AgentTurn {
  uid: number
  role: "agent"
  sender: string
  tools: ToolEntry[]
  text: string
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
