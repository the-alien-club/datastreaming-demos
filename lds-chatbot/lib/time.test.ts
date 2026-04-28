import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { dateGroup, timeAgo, toDate } from "./time"

const FIXED_NOW = new Date("2026-04-26T12:00:00Z").getTime()

describe("toDate", () => {
  it("returns null for null/undefined", () => {
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
  })

  it("returns null for invalid Date", () => {
    expect(toDate(new Date("not a date"))).toBeNull()
  })

  it("treats numbers <= 1e12 as epoch seconds", () => {
    const d = toDate(1_000_000_000) // 2001-09-09T01:46:40Z
    expect(d?.toISOString()).toBe("2001-09-09T01:46:40.000Z")
  })

  it("treats numbers > 1e12 as epoch milliseconds", () => {
    const d = toDate(1_700_000_000_000) // 2023-11-14T22:13:20Z
    expect(d?.toISOString()).toBe("2023-11-14T22:13:20.000Z")
  })

  it("parses ISO strings", () => {
    expect(toDate("2026-04-26T12:00:00Z")?.toISOString()).toBe("2026-04-26T12:00:00.000Z")
  })

  it("returns null for unparseable strings", () => {
    expect(toDate("definitely not a date")).toBeNull()
  })
})

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "" for null', () => {
    expect(timeAgo(null)).toBe("")
  })

  it('returns "just now" for events <60s in the past', () => {
    expect(timeAgo(new Date(FIXED_NOW - 30_000))).toBe("just now")
  })

  it("returns Xm ago for events 1-59 minutes old", () => {
    expect(timeAgo(new Date(FIXED_NOW - 5 * 60_000))).toBe("5m ago")
  })

  it("returns Xh ago for events 1-23 hours old", () => {
    expect(timeAgo(new Date(FIXED_NOW - 3 * 60 * 60_000))).toBe("3h ago")
  })

  it("returns Xd ago for events 1-6 days old", () => {
    expect(timeAgo(new Date(FIXED_NOW - 4 * 24 * 60 * 60_000))).toBe("4d ago")
  })

  it("falls back to a date string for events >7 days old", () => {
    const d = new Date(FIXED_NOW - 30 * 24 * 60 * 60_000)
    expect(timeAgo(d)).toBe(d.toLocaleDateString())
  })
})

describe("dateGroup", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns Today for the current day", () => {
    expect(dateGroup(new Date(FIXED_NOW - 60_000))).toBe("today")
  })

  it("returns Yesterday for the previous day", () => {
    expect(dateGroup(new Date(FIXED_NOW - 24 * 60 * 60_000))).toBe("yesterday")
  })

  it("returns Older for >2 days ago", () => {
    expect(dateGroup(new Date(FIXED_NOW - 5 * 24 * 60 * 60_000))).toBe("older")
  })

  it("returns Older for null", () => {
    expect(dateGroup(null)).toBe("older")
  })
})
