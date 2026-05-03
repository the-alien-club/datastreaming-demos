"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { McpCard, type McpRecord } from "@/components/cards/mcp-card"
import { ListToolbar } from "@/components/list-toolbar"
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/mcp-options"

/**
 * Read-only MCP library: search + multi-category + type filter, no
 * mutation handlers. Used by /mcps/library.
 */
export function McpsReadonlyGrid({ mcps }: { mcps: McpRecord[] }) {
  const t = useTranslations("mcps")
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("typeLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("typeLabel")}: {tCommon("filterAll")}</SelectItem>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {t("categoriesLabel")}
                  {selectedCategories.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5">{selectedCategories.length}</Badge>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto w-64">
                {CATEGORY_OPTIONS.map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat}
                    checked={selectedCategories.includes(cat)}
                    onCheckedChange={(checked) =>
                      setSelectedCategories((prev) =>
                        checked === true ? [...prev, cat] : prev.filter((c) => c !== cat),
                      )
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    {cat}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mcp) => (
            <McpCard key={mcp.id} mcp={mcp} />
          ))}
        </div>
      )}
    </>
  )
}
