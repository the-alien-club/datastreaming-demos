/**
 * Walk an MCP tool result JSON for the platform's canonical attribution field
 * names (`cluster_id`, `dataset_id`, `entry_id`). Returns deduped lists plus a
 * `hits` count (the size of the `results` array — `keyword_search.results[]`,
 * `list_datasets` results grouped by cluster, etc.). Used by the frontend to
 * compute royalties + per-cluster attribution from the streamed tool-result
 * blocks the Anthropic Messages API surfaces.
 *
 * Tools often return their payload as a JSON-encoded string inside a `text`
 * content block, sometimes wrapped in `{success, data:{...}}`. We don't try to
 * be clever about the wrapper — just walk every node.
 */
export interface ToolResultMeta {
  clusterIds: number[]
  datasetIds: number[]
  entryIds: number[]
  hits: number
}

export function extractResultMeta(rawContent: unknown): ToolResultMeta {
  let parsed: unknown = rawContent
  // The MCP connector surfaces `content` as an array of blocks, each often a
  // `{type:"text", text: <json string>}`. Unwrap.
  if (Array.isArray(rawContent)) {
    const firstText = rawContent.find(
      (b): b is { type: "text"; text: string } =>
        b != null &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    if (firstText) {
      try {
        parsed = JSON.parse(firstText.text)
      } catch {
        parsed = firstText.text
      }
    }
  } else if (typeof rawContent === "string") {
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      parsed = rawContent
    }
  }

  const clusterIds = new Set<number>()
  const datasetIds = new Set<number>()
  const entryIds = new Set<number>()
  let hits = 0

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return
    if (Array.isArray(node)) {
      for (const v of node) walk(v)
      return
    }
    const obj = node as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (k === "cluster_id" && typeof v === "number") clusterIds.add(v)
      if ((k === "dataset_id" || k === "datasetId") && typeof v === "number") {
        datasetIds.add(v)
      }
      if ((k === "entry_id" || k === "entryId") && typeof v === "number") {
        entryIds.add(v)
      }
      if (k === "dataset_ids" && Array.isArray(v)) {
        for (const n of v) if (typeof n === "number") datasetIds.add(n)
      }
      if (k === "results") {
        if (Array.isArray(v)) hits = Math.max(hits, v.length)
        else if (v && typeof v === "object") {
          let nested = 0
          for (const bucket of Object.values(v as Record<string, unknown>)) {
            if (
              bucket &&
              typeof bucket === "object" &&
              "datasets" in bucket &&
              Array.isArray((bucket as { datasets: unknown }).datasets)
            ) {
              nested += (bucket as { datasets: unknown[] }).datasets.length
            } else if (Array.isArray(bucket)) {
              nested += bucket.length
            }
          }
          if (nested > 0) hits = Math.max(hits, nested)
        }
      }
      walk(v)
    }
  }

  walk(parsed)

  return {
    clusterIds: [...clusterIds],
    datasetIds: [...datasetIds],
    entryIds: [...entryIds],
    hits: hits || datasetIds.size || entryIds.size || 0,
  }
}

/** Truncate a serialized result for chat-message display. */
export function snippetForDisplay(content: unknown, limit = 280): string {
  if (Array.isArray(content)) {
    const text = content
      .map((b) => {
        if (b && typeof b === "object" && "text" in b) {
          return String((b as { text: unknown }).text ?? "")
        }
        return ""
      })
      .join("\n")
      .trim()
    return text.slice(0, limit) || "(no output)"
  }
  if (typeof content === "string") return content.slice(0, limit) || "(no output)"
  try {
    return JSON.stringify(content).slice(0, limit)
  } catch {
    return "(unserializable)"
  }
}
