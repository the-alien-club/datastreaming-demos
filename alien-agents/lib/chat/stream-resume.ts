// localStorage-backed cursor for client-side stream resume.
//
// The translator emits a transient `data-streamProgress` part on every
// translated event; the chat client persists `(responseId, lastSeq)`
// from those beacons here, keyed by `conversationId`. On a tab refresh
// mid-stream `existing-chat-client.tsx` reads the cursor and reconnects
// via the platform's `GET /agent/:id/responses/:respId?starting_after=<seq>`
// endpoint (responses_v1.md §5).
//
// Each entry is intentionally small (one cursor per conversation, ≤200B)
// and is cleared on terminal events (`response.completed`/`failed`) or
// when the resume endpoint reports 404/410.

const STORAGE_KEY_PREFIX = "alien-agents:stream-progress:"

export interface StreamProgressBeacon {
  responseId: string
  sequenceNumber: number
  terminal: boolean
}

interface PersistedCursor {
  responseId: string
  sequenceNumber: number
  /** Wall-clock when written, ms. Used to age out stale cursors. */
  savedAt: number
}

/**
 * Server-side responses live for 24h in the platform's response store
 * (responses_v1.md §2.4). Aging out cursors after 23h keeps us from
 * trying to resume a response the platform has already evicted.
 */
const CURSOR_TTL_MS = 23 * 60 * 60 * 1000

function storageKey(conversationId: string): string {
  return `${STORAGE_KEY_PREFIX}${conversationId}`
}

function isAvailable(): boolean {
  if (typeof window === "undefined") return false
  try {
    return typeof window.localStorage !== "undefined"
  } catch {
    return false
  }
}

export function saveStreamProgress(
  conversationId: string,
  beacon: StreamProgressBeacon,
): void {
  if (!isAvailable() || beacon.terminal) return
  const cursor: PersistedCursor = {
    responseId: beacon.responseId,
    sequenceNumber: beacon.sequenceNumber,
    savedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(storageKey(conversationId), JSON.stringify(cursor))
  } catch {
    // Quota exceeded / private mode — resume is best-effort, don't fail
    // the chat over it.
  }
}

export function loadStreamProgress(
  conversationId: string,
): StreamProgressBeacon | null {
  if (!isAvailable()) return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(storageKey(conversationId))
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearStreamProgress(conversationId)
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    clearStreamProgress(conversationId)
    return null
  }
  const cursor = parsed as Partial<PersistedCursor>
  if (
    typeof cursor.responseId !== "string" ||
    typeof cursor.sequenceNumber !== "number" ||
    typeof cursor.savedAt !== "number"
  ) {
    clearStreamProgress(conversationId)
    return null
  }
  if (Date.now() - cursor.savedAt > CURSOR_TTL_MS) {
    clearStreamProgress(conversationId)
    return null
  }

  return {
    responseId: cursor.responseId,
    sequenceNumber: cursor.sequenceNumber,
    terminal: false,
  }
}

export function clearStreamProgress(conversationId: string): void {
  if (!isAvailable()) return
  try {
    window.localStorage.removeItem(storageKey(conversationId))
  } catch {
    // Same as save — best-effort.
  }
}
