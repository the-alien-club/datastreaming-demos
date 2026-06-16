/**
 * Wire types for the dynamic prompt-suggestions feature. The client (chip row
 * above the composer) posts a compact snapshot of the connected MCP sources
 * plus a short conversation memo; the server route calls Claude Haiku and
 * returns three short, click-to-send prompts.
 *
 * Kept in a dedicated file so the route and the hook stay in lockstep at the
 * type level — changing either side without updating the other won't compile.
 */
import type { Mode } from "@/hooks/use-mode"

/** Compact projection of the connected MCP configuration. */
export interface SuggestionsMcpSnapshot {
  clusters: Array<{
    cluster_id: number
    name: string
    description: string
    datasetCount: number
    /** First few dataset names per cluster — enough flavour, not the full list. */
    sampleDatasetNames: string[]
  }>
  externalApis: Array<{
    connector_id: number
    name: string
    description: string | null
  }>
}

export interface SuggestionsRequest {
  mode: Mode
  mcpSnapshot: SuggestionsMcpSnapshot
  /** `null` on the very first call (no conversation yet). */
  memo: string | null
  /** Hint for the per-suggestion character cap. Mobile passes a tighter cap. */
  lengthHint?: number
}

export interface SuggestionsResponse {
  /** Exactly three prompts, each non-empty. */
  suggestions: [string, string, string]
}

export type SuggestionsErrorCode =
  | "invalid-body"
  | "empty-config"
  | "haiku-failed"
  | "malformed-output"
  | "platform-env-missing"

export interface SuggestionsErrorBody {
  error: SuggestionsErrorCode
  message: string
}
