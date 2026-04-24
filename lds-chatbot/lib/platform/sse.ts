const PLATFORM_API_URL = process.env.PLATFORM_API_URL!

// Retry policy. The platform's job stream is safe to reconnect to: the
// /jobs/:id/stream handler emits an `init` event on every connection that
// re-ships the cumulative `job.result`, and the consumer in
// app/api/chat/route.ts uses a monotonic-advance guard on `chunks.length`
// so re-shipped chunks are skipped and only genuinely new deltas surface.
const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 10_000
const JITTER_FRACTION = 0.2

// Fatal HTTP statuses on initial connect — never retry these. 401/403 are
// auth problems, 404/410 mean the job doesn't exist, 400 is a malformed
// request. Retrying any of them is wasted work that will never succeed.
const FATAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 410])

// Transient error indicators. Matched against `err.code`, `err.cause?.code`,
// and the lowercased `err.message`. Anything in this set is reconnect-worthy.
const TRANSIENT_ERROR_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
])

interface FetchLikeError extends Error {
  code?: string
  cause?: { code?: string } | unknown
}

/**
 * Decides whether a thrown error during fetch/stream-read is the kind of
 * transient connection failure we should reconnect on. Returns the reason
 * string for logging if so, or null if the error is fatal.
 */
function classifyTransientError(err: unknown): string | null {
  if (!(err instanceof Error)) return null

  const e = err as FetchLikeError
  const code = e.code
  const causeCode =
    e.cause && typeof e.cause === "object" && "code" in (e.cause as object)
      ? (e.cause as { code?: string }).code
      : undefined
  const msg = e.message ?? ""

  if (code && TRANSIENT_ERROR_CODES.has(code)) return code
  if (causeCode && TRANSIENT_ERROR_CODES.has(causeCode)) return causeCode

  // undici wraps abrupt socket teardown as `TypeError: terminated`.
  if (e.name === "TypeError" && msg === "terminated") return "terminated"

  // Last-ditch substring scan — some runtimes flatten the cause into the
  // message instead of attaching a code.
  const lower = msg.toLowerCase()
  for (const known of TRANSIENT_ERROR_CODES) {
    if (lower.includes(known.toLowerCase())) return known
  }
  if (lower.includes("terminated")) return "terminated"

  return null
}

/**
 * Marker error class for fatal HTTP statuses on the initial connect, so the
 * outer retry loop can short-circuit without inspecting strings.
 */
class FatalSSEResponseError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "FatalSSEResponseError"
    this.status = status
  }
}

function computeBackoffMs(attempt: number): number {
  // attempt is 1-indexed: 1 → 500ms, 2 → 1s, 3 → 2s, 4 → 4s, 5 → 8s.
  const base = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
  const jitter = base * JITTER_FRACTION * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(base + jitter))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * One end-to-end attempt: open the SSE connection and yield every parsed
 * event until the body closes cleanly or the read throws. Throws on fatal
 * HTTP responses (FatalSSEResponseError) or any read-side error so the
 * outer retry loop can decide what to do.
 */
async function* runSSEAttempt(
  jobId: number,
  accessToken: string
): AsyncGenerator<Record<string, unknown>> {
  const response = await fetch(`${PLATFORM_API_URL}/jobs/${jobId}/stream`, {
    method: "GET",
    headers: {
      "x-oauth-access-token": accessToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)")
    const message = `Platform SSE error ${response.status} ${response.statusText} on /jobs/${jobId}/stream: ${body}`
    if (FATAL_HTTP_STATUSES.has(response.status)) {
      throw new FatalSSEResponseError(response.status, message)
    }
    // 5xx and any other non-fatal status — surface as a regular Error and
    // let the outer loop retry it.
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error(`Platform SSE: empty response body for job ${jobId}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split on double-newline (SSE event boundary)
      const events = buffer.split("\n\n")

      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = events.pop() ?? ""

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue

        // Find the data line
        const lines = eventBlock.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === "[DONE]") continue

            try {
              const parsed = JSON.parse(jsonStr)
              yield parsed as Record<string, unknown>
            } catch {
              // Malformed JSON — skip this event
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Streams SSE events from the platform job stream endpoint, transparently
 * reconnecting on transient connection failures (socket reset, undici
 * "terminated", 5xx on connect). The platform re-ships cumulative state
 * on every reconnect, and the chat consumer's monotonic-advance guard
 * de-duplicates re-shipped chunks, so reconnects are invisible to callers.
 *
 * Yields each parsed JSON event object as it arrives. Each event has the
 * shape: { type: "init"|"update"|"done", status: string, result: {...} }
 *
 * Retry policy: up to 5 attempts with exponential backoff (500ms → 8s) and
 * ±20% jitter. Fatal statuses (400/401/403/404/410) are not retried.
 */
export async function* streamJobSSE(
  jobId: number,
  accessToken: string
): AsyncGenerator<Record<string, unknown>> {
  let attempt = 0
  let lastError: unknown = null

  // The outer try/finally guarantees we don't enter another retry iteration
  // when the consumer breaks out of `for await` (which propagates as a
  // `return()` on this generator). The `consumerBroke` flag captures that
  // — if we never reached the `attempt < MAX_ATTEMPTS` re-entry check
  // because the inner `yield` resumed with a `return`, finally just runs
  // and we exit. The flag is purely defensive logging.
  let cleanFinish = false

  try {
    while (attempt < MAX_ATTEMPTS) {
      attempt++
      try {
        for await (const event of runSSEAttempt(jobId, accessToken)) {
          yield event
        }
        // Stream closed cleanly (reader returned done: true). This is a
        // successful termination — exit the retry loop without retrying.
        cleanFinish = true
        return
      } catch (err) {
        lastError = err

        // Fatal HTTP status — never retry.
        if (err instanceof FatalSSEResponseError) {
          throw err
        }

        const reason = classifyTransientError(err)
        const isHttp5xx =
          err instanceof Error && /^Platform SSE error 5\d\d\b/.test(err.message)

        if (!reason && !isHttp5xx) {
          // Not a transient error we recognise — propagate.
          throw err
        }

        if (attempt >= MAX_ATTEMPTS) break

        const backoffMs = computeBackoffMs(attempt)
        const truncatedMsg =
          err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
        console.warn(
          `[streamJobSSE] reconnect job=${jobId} attempt=${attempt}/${MAX_ATTEMPTS} ` +
            `reason=${reason ?? "http5xx"} backoff=${backoffMs}ms err="${truncatedMsg}"`
        )
        await sleep(backoffMs)
      }
    }

    // Exhausted retries.
    const lastMsg =
      lastError instanceof Error ? lastError.message : String(lastError)
    console.warn(
      `[streamJobSSE] gave up job=${jobId} attempts=${attempt} lastErr="${lastMsg.slice(0, 200)}"`
    )
    throw new Error(
      `Platform SSE: gave up after ${attempt} attempts on /jobs/${jobId}/stream — last error: ${lastMsg}`
    )
  } finally {
    // No-op for now; placeholder so future cleanup (e.g. abort signal
    // wiring) has a single home. `cleanFinish` is only kept to make the
    // intent of the control flow explicit at review time.
    void cleanFinish
  }
}
