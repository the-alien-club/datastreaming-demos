// Single source of truth for relative-time formatting. Consolidates the
// three near-identical implementations that used to live in
// `app/(app)/conversations/page.tsx`, `app/(app)/datasets/page.tsx`, and
// `app/(app)/datasets/[id]/page.tsx`.
//
// Accepts whatever the page happens to hold — Date, ISO string, epoch
// milliseconds, or epoch seconds (the "epoch seconds" case comes from
// some platform routes that return Unix timestamps as integers).

export type TimeInput = Date | string | number | null | undefined

/**
 * Coerce a heterogeneous time value to a `Date`. Returns `null` when the
 * input is null/undefined or fails to parse.
 *
 * Heuristic for numbers: anything <= 1e12 is treated as epoch seconds
 * (timestamps before 33658 AD), anything larger as epoch milliseconds.
 * That matches the data semantics across the three call sites without
 * a config flag.
 */
export function toDate(value: TimeInput): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "number") {
    const ms = value <= 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === "string") {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Human-readable relative time ("3m ago", "yesterday at …"). Returns
 * an empty string for null/invalid inputs so callers can interpolate
 * without guarding.
 */
export function timeAgo(value: TimeInput): string {
  const d = toDate(value)
  if (!d) return ""
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

// Locale-neutral keys — mapped to translations in conversations/page.tsx.
export type DateGroup = "today" | "yesterday" | "older"

/**
 * Bucket a date into today / yesterday / older for the conversations
 * list grouping. Returns locale-neutral keys for i18n translation.
 */
export function dateGroup(value: TimeInput): DateGroup {
  const d = toDate(value)
  if (!d) return "older"
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dDay.getTime() === today.getTime()) return "today"
  if (dDay.getTime() === yesterday.getTime()) return "yesterday"
  return "older"
}
