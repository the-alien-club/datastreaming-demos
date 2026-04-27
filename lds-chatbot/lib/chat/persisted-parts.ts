// Pure helpers for persisting AI-SDK `UIMessage.parts` to Postgres.
//
// Both the POST `/api/chat` route and the resume route drain a tee'd
// chunk stream into a `UIMessage`, then write the assembled `parts`
// array into the `messages.parts` jsonb column so a tab refresh can
// replay the rich rendering (text bubbles, tool-call chips, subagent
// panels) instead of collapsing to plain text. These helpers don't
// touch `db`/`auth` so they can be unit-tested in isolation.

import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import type { StoredMessagePart } from "@/lib/db/schema"

/**
 * Concatenate every text part's text in order. Used as the fallback
 * `messages.content` value when the run translator didn't surface its
 * own canonical text (rare — only on a torn upstream that ate the
 * `response.completed` event).
 */
export function extractPlainTextFromParts(
  parts: UIMessage["parts"] | undefined,
): string {
  if (!parts) return ""
  return parts
    .filter((p): p is UIMessagePart<UIDataTypes, UITools> & { type: "text"; text: string } =>
      p.type === "text" && typeof (p as { text?: unknown }).text === "string",
    )
    .map(p => p.text)
    .join("")
}

/**
 * Strip transient bookkeeping parts before persisting. The chat client
 * receives `data-streamProgress` (resume cursor beacon, marked
 * `transient: true` so it never reaches the messages store) and
 * `data-conversationId` (one-shot URL hint emitted at start of stream)
 * — those are bookkeeping, not message content. Everything else is
 * kept verbatim so replay matches the live stream byte-for-byte.
 */
export function filterPersistableParts(
  parts: UIMessage["parts"] | undefined,
): StoredMessagePart[] {
  if (!parts) return []
  return parts.filter((p) => {
    const t = (p as { type: string }).type
    return t !== "data-streamProgress" && t !== "data-conversationId"
  }) as StoredMessagePart[]
}
