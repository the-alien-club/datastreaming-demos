"use client"

import { useCallback, useEffect, useState } from "react"

export type Mode = "dataflow" | "agentic"
const STORAGE_KEY = "alien-demo-mode"

function readStoredMode(): Mode {
  if (typeof window === "undefined") return "dataflow"
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY)
    if (v === "agentic" || v === "dataflow") return v
  } catch {
    // sessionStorage may be unavailable (Safari private mode, SSR).
  }
  return "dataflow"
}

/**
 * Mode state persisted in sessionStorage. The page can be reloaded mid-demo
 * without losing the operator's Data flow / Agentic flow choice. Tab close
 * resets to the default (Data flow) on next open.
 *
 * `requestSwitch` returns the target; callers decide whether to show the
 * confirmation modal (when a chat is in progress) or apply immediately.
 */
export function useMode(): {
  mode: Mode
  setMode: (m: Mode) => void
} {
  // Lazy initializer so SSR doesn't read window during render. On the first
  // client paint we sync from sessionStorage.
  const [mode, setModeState] = useState<Mode>("dataflow")

  useEffect(() => {
    setModeState(readStoredMode())
  }, [])

  const setMode = useCallback((m: Mode) => {
    setModeState(m)
    try {
      window.sessionStorage.setItem(STORAGE_KEY, m)
    } catch {
      // ignore — non-critical persistence.
    }
  }, [])

  return { mode, setMode }
}
