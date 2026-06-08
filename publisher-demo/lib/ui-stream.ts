/**
 * SSE chunk reader for the AI SDK v6 `createUIMessageStreamResponse` format.
 *
 * Each event is a single `data: <json>\n\n` frame. We yield the parsed JSON
 * payloads (which are `UIMessageChunk` objects: text-start, text-delta,
 * tool-input-available, data-toolCall, finish, ...). Comment frames (lines
 * starting with `:`) are skipped — the AI SDK uses them as keep-alives.
 */
export async function* readUiMessageChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")

        const dataLines: string[] = []
        for (const rawLine of frame.split("\n")) {
          if (rawLine.startsWith(":") || rawLine.length === 0) continue
          if (rawLine.startsWith("data:")) {
            dataLines.push(rawLine.slice(5).replace(/^ /, ""))
          }
        }
        if (dataLines.length === 0) continue

        const dataStr = dataLines.join("\n")
        // The AI SDK terminates the stream with `data: [DONE]`. Skip it.
        if (dataStr === "[DONE]") continue
        try {
          yield JSON.parse(dataStr) as Record<string, unknown>
        } catch {
          // Skip malformed frames rather than crashing the whole turn.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
