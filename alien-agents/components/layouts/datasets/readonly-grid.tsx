"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { SelectDatasetStatusFilter } from "@/components/selects/datasets/status-filter"
import { CardDatasetRow, type DatasetRowData } from "@/components/cards/datasets/row"
import { ListToolbar } from "@/components/list-toolbar"

/**
 * Read-only datasets list with search + status filter, used by
 * /datasets/library (server-rendered page passes pre-fetched rows).
 */
export function LayoutDatasetsReadonlyGrid({ datasets }: { datasets: DatasetRowData[] }) {
  const tCommon = useTranslations("common")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const normalised = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return datasets.filter((d) => {
      if (statusFilter !== "all" && (d.status ?? "pending") !== statusFilter) return false
      if (!normalised) return true
      return d.name.toLowerCase().includes(normalised)
    })
  }, [datasets, normalised, statusFilter])

  return (
    <>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        resultCount={{ total: datasets.length, shown: filtered.length }}
        filters={
          <SelectDatasetStatusFilter value={statusFilter} onValueChange={setStatusFilter} />
        }
      />
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((dataset) => (
            <CardDatasetRow key={dataset.id} dataset={dataset} />
          ))}
        </div>
      )}
    </>
  )
}
