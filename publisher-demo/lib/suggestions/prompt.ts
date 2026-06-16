/**
 * Prompt construction for the Haiku-backed prompt-suggestions feature.
 *
 * Split out from `route.ts` so the prompt itself is testable in isolation and
 * the route stays focused on wire/transport concerns. The system + MCP blocks
 * are *cacheable* (Anthropic prompt caching, `cache_control: ephemeral`) — the
 * memo is the only varying payload, which keeps the per-call cost near-zero
 * once the cache warms up.
 */
import type { Mode } from "@/hooks/use-mode"
import type { SuggestionsMcpSnapshot } from "./types"

const DEFAULT_MAX_CHARS = 90

/** System instructions, identical across calls in a given mode. Cacheable. */
export function buildSystemPrompt(mode: Mode, maxChars: number = DEFAULT_MAX_CHARS): string {
  const modeFraming =
    mode === "agentic"
      ? "Mode: agentic — the user runs multi-step research workflows on these sources. Favour prompts that imply planning, comparison, or synthesis."
      : "Mode: dataflow — the user asks single-shot questions. Favour prompts that imply a direct lookup, search, or summarisation."

  return [
    "You are a UI assistant that produces prompt suggestions for a data-discovery agent demo.",
    "The user has connected a set of data sources (MCP clusters and external APIs).",
    "Given the connected sources, and optionally a short summary of the current conversation,",
    "produce exactly three short prompts the user could click to continue exploring.",
    "",
    "Rules:",
    `- Output STRICT JSON: {"suggestions": ["...", "...", "..."]}`,
    `- Exactly three suggestions, each non-empty and at most ${maxChars} characters.`,
    "- Imperative voice. No trailing punctuation. No surrounding quotes.",
    "- Mention the connected sources by name where natural.",
    "- Never invent a source that isn't in the MCP snapshot.",
    "- If a conversation memo is given, the prompts must advance the topic, not restart it.",
    "- If no memo is given, the prompts should be diverse openers spanning the available sources.",
    "",
    modeFraming,
    "",
    "Return only the JSON object. No prose, no markdown fences.",
  ].join("\n")
}

/** Cacheable description of the user's MCP configuration. */
export function buildMcpDescriptionBlock(snapshot: SuggestionsMcpSnapshot): string {
  const lines: string[] = []
  if (snapshot.clusters.length > 0) {
    lines.push("Connected data clusters:")
    for (const c of snapshot.clusters) {
      const samples =
        c.sampleDatasetNames.length > 0
          ? ` — datasets include ${c.sampleDatasetNames.join(", ")}`
          : ""
      const desc = c.description ? ` (${c.description})` : ""
      lines.push(`- "${c.name}"${desc} · ${c.datasetCount} dataset(s)${samples}`)
    }
  } else {
    lines.push("Connected data clusters: (none)")
  }

  if (snapshot.externalApis.length > 0) {
    lines.push("")
    lines.push("Connected external APIs:")
    for (const a of snapshot.externalApis) {
      const desc = a.description ? ` — ${a.description}` : ""
      lines.push(`- "${a.name}"${desc}`)
    }
  }
  return lines.join("\n")
}

/**
 * Per-call varying message. NOT cached.
 *
 * The trailing `Variation token` is the only thing that changes between
 * otherwise-identical calls (same MCP config, same memo). The Anthropic
 * Messages API has no `seed` param; without a varying suffix the model
 * tends to converge on the same three suggestions even at default
 * temperature. The token is just a few bytes — cheap nudge, never echoed.
 */
export function buildUserPrompt(memo: string | null, nonce: string): string {
  if (!memo) {
    return [
      "No conversation yet. Produce three diverse opening prompts that showcase the connected sources.",
      `Variation token: ${nonce} — use this only to vary your output; do NOT reference it in the suggestions.`,
      "Return the JSON now.",
    ].join("\n")
  }
  return [
    "Conversation memo (most recent exchange):",
    memo,
    "",
    "Produce three follow-up prompts that advance this conversation.",
    `Variation token: ${nonce} — use this only to vary your output; do NOT reference it in the suggestions.`,
    "Return the JSON now.",
  ].join("\n")
}

/**
 * Parse Haiku's text output into a strict three-tuple of non-empty strings.
 * Throws on any deviation — there is no fallback path. Callers map the error
 * to a `malformed-output` HTTP response so the client can react cleanly.
 */
export function parseHaikuOutput(
  rawText: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): [string, string, string] {
  // Haiku occasionally wraps JSON in a markdown fence despite the instructions.
  // Strip a single fenced block if present, otherwise use the raw text.
  const trimmed = rawText.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`could not parse JSON: ${(err as Error).message}`)
  }

  if (!parsed || typeof parsed !== "object" || !("suggestions" in parsed)) {
    throw new Error("missing `suggestions` field")
  }
  const arr = (parsed as { suggestions: unknown }).suggestions
  if (!Array.isArray(arr) || arr.length !== 3) {
    throw new Error("`suggestions` must be an array of length 3")
  }
  const out: string[] = []
  for (const v of arr) {
    if (typeof v !== "string") throw new Error("suggestion is not a string")
    const s = v.trim()
    if (s.length === 0) throw new Error("suggestion is empty")
    // Soft enforce length: truncate if over by a hair, throw if egregious.
    if (s.length > maxChars * 1.5) {
      throw new Error(`suggestion exceeds ${Math.round(maxChars * 1.5)} chars`)
    }
    out.push(s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s)
  }
  return [out[0], out[1], out[2]]
}
