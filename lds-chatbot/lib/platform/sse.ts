const PLATFORM_API_URL = process.env.PLATFORM_API_URL!

/**
 * Streams SSE events from the platform job stream endpoint.
 * Yields each parsed JSON event object as it arrives.
 *
 * Each event has the shape:
 * { type: "init"|"update"|"done", status: string, result: {...} }
 */
export async function* streamJobSSE(
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
    throw new Error(
      `Platform SSE error ${response.status} ${response.statusText} on /jobs/${jobId}/stream: ${body}`
    )
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
