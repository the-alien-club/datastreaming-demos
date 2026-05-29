"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Page-level list toolbar: full-width search + optional filter slot, with
 * a result counter underneath. Used on the four list pages (agents,
 * specialists, datasets, MCPs).
 */
export function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  filters,
  resultCount,
  className,
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
  filters?: ReactNode
  resultCount?: { total: number; shown: number }
  className?: string
}) {
  const tCommon = useTranslations("common")
  const showCounter =
    resultCount !== undefined && resultCount.shown !== resultCount.total

  return (
    <div className={cn("space-y-2 mb-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder ?? tCommon("searchPlaceholder")}
            className="pl-9 pr-9"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onQueryChange("")}
              aria-label={tCommon("clear")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
      </div>
      {showCounter && (
        <p className="text-xs text-muted-foreground">
          {tCommon("resultCount", {
            shown: resultCount.shown,
            total: resultCount.total,
          })}
        </p>
      )}
    </div>
  )
}
