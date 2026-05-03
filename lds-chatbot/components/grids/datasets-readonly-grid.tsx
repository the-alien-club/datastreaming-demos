"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatasetRow, type DatasetRowData } from "@/components/cards/dataset-row"
import { ListToolbar } from "@/components/list-toolbar"

/**
 * Read-only datasets list with search + status filter, used by
 * /datasets/library (server-rendered page passes pre-fetched rows).
 */
export function DatasetsReadonlyGrid({ datasets }: { datasets: DatasetRowData[] }) {
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("filterAll")}</SelectItem>
              <SelectItem value="ready">ready</SelectItem>
              <SelectItem value="processing">processing</SelectItem>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="error">error</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((dataset) => (
            <DatasetRow key={dataset.id} dataset={dataset} />
          ))}
        </div>
      )}
    </>
  )
}
