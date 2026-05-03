"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Compact list toolbar for in-dialog pickers. Single search input, smaller
 * footprint than the page-level `<ListToolbar>`.
 */
export function ListToolbarCompact({
  query,
  onQueryChange,
  placeholder,
  className,
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
  className?: string
}) {
  const tCommon = useTranslations("common")
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder ?? tCommon("searchPlaceholder")}
        className="pl-8 h-8 text-sm"
      />
    </div>
  )
}
