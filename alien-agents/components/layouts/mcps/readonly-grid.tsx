"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { CardMcp, type McpRecord } from "@/components/cards/mcps/mcp"
import { ListToolbar } from "@/components/list-toolbar"
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/mcp-options"
import { SelectMcpTypeFilter } from "@/components/selects/mcps/type-filter"
import { DropdownMcpColumnFilter } from "@/components/dropdowns/mcps/column-filter"

/**
 * Read-only MCP library: search + multi-category + type filter, no
 * mutation handlers. Used by /mcps/library.
 */
export function LayoutMcpsReadonlyGrid({ mcps }: { mcps: McpRecord[] }) {
  const tCommon = useTranslations("common")
  const [query, setQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const normalised = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return mcps.filter((m) => {
      if (typeFilter !== "all" && (m.type ?? "") !== typeFilter) return false
      if (selectedCategories.length > 0 && !selectedCategories.some((c) => m.categories.includes(c))) {
        return false
      }
      if (!normalised) return true
      // Name + provider only — descriptions cross-reference too much.
      const haystack = `${m.name} ${m.provider ?? ""}`.toLowerCase()
      return haystack.includes(normalised)
    })
  }, [mcps, normalised, typeFilter, selectedCategories])

  return (
    <>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        resultCount={{ total: mcps.length, shown: filtered.length }}
        filters={
          <>
            <SelectMcpTypeFilter
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={[...TYPE_OPTIONS]}
            />
            <DropdownMcpColumnFilter
              value={selectedCategories}
              onChange={setSelectedCategories}
              options={[...CATEGORY_OPTIONS]}
            />
          </>
        }
      />
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mcp) => (
            <CardMcp key={mcp.id} mcp={mcp} />
          ))}
        </div>
      )}
    </>
  )
}
