/**
 * Typed OpenAIRE Graph API errors — the resolve stage classifies on these:
 *   - Permanent (404 not found, 400 malformed id) → the doc can never resolve,
 *     so the stage marks it `skipped` and never retries.
 *   - Transient (5xx, network, timeout) → retry with backoff; on the last attempt
 *     the stage marks the doc `failed` so it reaches a terminal state.
 *
 * Mirrors the BnF error taxonomy the pipeline base already understands (a bare
 * throw is coerced into a non-terminal fail → retry; a stage maps a known-terminal
 * condition to a terminal outcome itself).
 */

export type PermanentCause = "not_found" | "bad_request" | "malformed_id";
export type TransientCause = "server_error" | "network" | "timeout";

export class PermanentOpenAireError extends Error {
  constructor(
    readonly cause: PermanentCause,
    readonly detail: { status?: number; id?: string } = {},
  ) {
    super(`openaire permanent (${cause}) status=${detail.status ?? "-"} id=${detail.id ?? "-"}`);
    this.name = "PermanentOpenAireError";
  }
}

export class TransientOpenAireError extends Error {
  constructor(
    readonly cause: TransientCause,
    readonly detail: { status?: number; id?: string } = {},
  ) {
    super(`openaire transient (${cause}) status=${detail.status ?? "-"} id=${detail.id ?? "-"}`);
    this.name = "TransientOpenAireError";
  }
}
