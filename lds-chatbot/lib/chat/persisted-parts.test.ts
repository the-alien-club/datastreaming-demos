import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import { extractPlainTextFromParts, filterPersistableParts } from "./persisted-parts"

// Convenience cast: we build minimally-shaped parts for tests; the helpers
// only inspect `type` and (for text) `text`, so the wider AI SDK union
// doesn't need to be satisfied here.
function asParts(parts: Array<{ type: string } & Record<string, unknown>>): UIMessage["parts"] {
  return parts as unknown as UIMessage["parts"]
}

describe("extractPlainTextFromParts", () => {
  it("returns the empty string for missing or empty parts", () => {
    expect(extractPlainTextFromParts(undefined)).toBe("")
    expect(extractPlainTextFromParts(asParts([]))).toBe("")
  })

  it("concatenates every text part in order", () => {
    const parts = asParts([
      { type: "text", text: "Hello, " },
      { type: "data-toolCall", data: { name: "search", args: {} } },
      { type: "text", text: "world." },
    ])
    expect(extractPlainTextFromParts(parts)).toBe("Hello, world.")
  })

  it("ignores parts whose `text` field isn't a string", () => {
    const parts = asParts([
      { type: "text", text: "kept" },
      { type: "text", text: undefined as unknown as string },
      { type: "text", text: 42 as unknown as string },
    ])
    expect(extractPlainTextFromParts(parts)).toBe("kept")
  })

  it("ignores non-text parts", () => {
    const parts = asParts([
      { type: "data-conversationId", data: "abc" },
      { type: "data-subagent", data: { agentId: "x", name: "Sub" } },
    ])
    expect(extractPlainTextFromParts(parts)).toBe("")
  })
})

describe("filterPersistableParts", () => {
  it("returns an empty array for missing or empty parts", () => {
    expect(filterPersistableParts(undefined)).toEqual([])
    expect(filterPersistableParts(asParts([]))).toEqual([])
  })

  it("strips data-streamProgress (transient resume beacon)", () => {
    const parts = asParts([
      { type: "text", text: "answer" },
      { type: "data-streamProgress", data: { responseId: "r1", sequenceNumber: 5, terminal: false } },
    ])
    expect(filterPersistableParts(parts)).toEqual([{ type: "text", text: "answer" }])
  })

  it("strips data-conversationId (one-shot URL hint)", () => {
    const parts = asParts([
      { type: "data-conversationId", data: "conv-1" },
      { type: "text", text: "answer" },
    ])
    expect(filterPersistableParts(parts)).toEqual([{ type: "text", text: "answer" }])
  })

  it("preserves text + data-toolCall + data-subagent in order", () => {
    const parts = asParts([
      { type: "text", text: "Bonne question, je vais chercher." },
      {
        type: "data-toolCall",
        data: { id: "t1", name: "legifrance_rechercher_code", args: { query: "code civil" } },
      },
      { type: "data-subagent", data: { agentId: "a2", name: "Légifrance specialist", kind: "subagent" } },
      { type: "text", text: "Voici la réponse." },
    ])
    const filtered = filterPersistableParts(parts)
    expect(filtered).toHaveLength(4)
    expect(filtered.map((p) => (p as { type: string }).type)).toEqual([
      "text",
      "data-toolCall",
      "data-subagent",
      "text",
    ])
  })
})
