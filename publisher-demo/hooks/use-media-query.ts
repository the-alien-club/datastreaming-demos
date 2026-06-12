"use client"

import { useEffect, useState } from "react"

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Defaults to `false` during SSR + first paint so the desktop shell renders
 * on initial server-rendered HTML; the mobile shell mounts on next tick
 * if the breakpoint is satisfied.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])

  return matches
}
