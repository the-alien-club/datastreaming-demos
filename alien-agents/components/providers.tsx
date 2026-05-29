"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"

/**
 * Client-side provider tree for the entire app.
 *
 * QueryClient is created with `useState` (not a module-level singleton) so
 * each Request / navigation gets a fresh cache in React Server Components
 * environments. The factory function runs once per component mount.
 *
 * Defaults:
 * - staleTime: 60 s  — queries stay fresh for a minute without a refetch.
 * - retry: 1         — one retry on failure before surfacing the error.
 * - DevTools are tree-shaken to zero bytes in production by the package itself.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
