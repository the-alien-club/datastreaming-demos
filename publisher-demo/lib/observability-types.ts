/**
 * Shared observability shapes used by the orchestrator hook and the
 * (presentational) Observability panel.
 */

export interface Counters {
  apiCalls: number
  /** Cumulative hits across every `tool-result` event (datasets touched). */
  dataPoints: number
  royalties: number
}

export interface TapeRow {
  /** Stable react key — toolUseId when known, else stringified timestamp. */
  uid: string
  /** HH:MM:SS clock time the call landed. */
  t: string
  /** "tool_name(args)" line 1. */
  tool: string
  /** "N tok · €X.XXXX · Label" line 2. */
  meta: string
  /** Used to drive the `.tape-row.enter` animation on the most recent row. */
  fresh: boolean
}

export interface AttributionRow {
  /** Unique key — `cluster:<id>`, `connector:<id>`, or `tool:<name>` fallback. */
  key: string
  /** Display label (cluster / connector name). */
  label: string
  /** Cumulative € attributed to this source so far this session. */
  eur: number
  /** Number of tool calls attributed to this source — visible even when
   * some/all calls had unit_price_cents=0 in the platform DB so the user can
   * see "3 calls · €0.010" instead of guessing why a counter looks low. */
  calls: number
}

export interface ObservabilityPulse {
  /** Datasource row id to pulse, monotonically bumped `n` for re-trigger. */
  ds: { id: string; n: number } | null
  /** API connector id to pulse. */
  api: { id: string; n: number } | null
  /** Attribution row key to pulse, plus the € amount for the floating `+€…` blip. */
  attr: { key: string; n: number; amount: number } | null
}
