// Helpers for reading the final output of an agent workflow job.
//
// Per-node outputs live under `result.results`, keyed by node id. Our workflows
// emit two output nodes with different wrapping shapes:
//
//   agentOutput-5  → [{ answer: {...}, session_id }]
//   httpResponse-2 → [{ results: { data: { answer: {...}, session_id? } } }]
//
// The old extractor hard-coded `Object.keys(results)[0]` + the httpResponse-2
// wrapping path, which silently returned null whenever `agentOutput-5` came
// first in iteration order (most of the time). We now probe both layouts and
// return the first usable answer.

export interface AgentAnswer {
  content: string | null
  metadata: Record<string, unknown> | null
}

export interface AgentOutput {
  sessionId: string | null
  answer: AgentAnswer
}

const EMPTY: AgentOutput = {
  sessionId: null,
  answer: { content: null, metadata: null },
}

export function extractAgentOutput(
  result: Record<string, unknown> | null | undefined
): AgentOutput {
  const results = result?.results as Record<string, unknown> | null | undefined
  if (!results) return EMPTY

  for (const node of Object.values(results)) {
    const first = Array.isArray(node) ? node[0] : node
    if (!first || typeof first !== "object") continue

    const outer = first as Record<string, unknown>
    // httpResponse-2 wraps its payload under `.results.data`; agentOutput-5
    // exposes it directly on the entry.
    const wrapped = (outer.results as Record<string, unknown> | undefined)
      ?.data as Record<string, unknown> | undefined
    const body = wrapped ?? outer

    const answerRaw = body.answer as Record<string, unknown> | undefined

    const sessionId =
      (typeof body.session_id === "string" ? (body.session_id as string) : null) ??
      (answerRaw && typeof answerRaw.session_id === "string"
        ? (answerRaw.session_id as string)
        : null)

    const content =
      answerRaw && typeof answerRaw.content === "string"
        ? (answerRaw.content as string)
        : null

    const metadata =
      answerRaw &&
      typeof answerRaw.metadata === "object" &&
      answerRaw.metadata !== null
        ? (answerRaw.metadata as Record<string, unknown>)
        : null

    if (sessionId || content || metadata) {
      return { sessionId, answer: { content, metadata } }
    }
  }

  return EMPTY
}
