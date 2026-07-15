// lib/format.ts
// Small, framework-free formatting helpers shared across cards/lists.
// Relative-time strings are English (the app's default working language); the
// agent's own output is never passed through here — see playbook/i18n.md.

/**
 * Compact English relative time: "just now", "5 min ago", "3 h ago", "2 d ago",
 * then an absolute "Mar 12" beyond a week. Used by the session list and the
 * research artefacts picker so they read identically.
 */
export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return "just now"
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`
  if (diff < day) return `${Math.floor(diff / hour)} h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" })
}
