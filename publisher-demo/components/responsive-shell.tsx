"use client"

import { useMediaQuery } from "@/hooks/use-media-query"
import { DemoApp } from "./demo-app"
import { DemoAppMobile } from "./demo-app-mobile"

/**
 * Conditional mount between desktop and mobile shells at 720px. State lives
 * in `useOrchestratorState()` and is mounted inside each shell, so resizing
 * across the breakpoint loses local UI state (open chat, current page).
 * Acceptable for a demo — users don't resize mid-pitch. React Query and
 * the event bus survive because they live above in `<Providers>`.
 */
export function ResponsiveShell() {
  const isMobile = useMediaQuery("(max-width: 720px)")
  return isMobile ? <DemoAppMobile /> : <DemoApp />
}
