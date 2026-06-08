"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { DemoEventsProvider } from "@/hooks/use-demo-events"

/**
 * Client-side providers wrapping the demo:
 *   - TanStack Query for /api/demo/config + /api/demo/pricing
 *   - Demo event bus (typed; ref-based listener registry)
 *
 * Per [web-app/CLAUDE.md] the project convention is no global staleTime
 * default — individual hooks set their own (configuration is long-lived,
 * pricing is essentially static for a session).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <DemoEventsProvider>{children}</DemoEventsProvider>
    </QueryClientProvider>
  )
}
