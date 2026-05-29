"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { AlertCircle, Database, Globe, Lock, Plus, Trash2, Eye, Loader2 } from "lucide-react"
import { SelectDatasetStatusFilter } from "@/components/selects/datasets/status-filter"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { CardDatasetRow, type DatasetRowData } from "@/components/cards/datasets/row"
import { ListToolbar } from "@/components/list-toolbar"
import { DATASET_STATUS } from "@/lib/db/schema"
import { ROUTES } from "@/lib/constants"

export interface DatasetRecord extends DatasetRowData {
  clusterDatasetId: number | null
  isOwn: boolean
  updatedAt: number | null
}

type DatasetsClientProps = {
  initialDatasets: DatasetRecord[]
}

export function DatasetsClient({ initialDatasets }: DatasetsClientProps) {
  const t = useTranslations("datasets")
  const tCommon = useTranslations("common")
  const [datasets, setDatasets] = useState<DatasetRecord[]>(initialDatasets)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)

  // Filter state
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  async function handleTogglePublic(dataset: DatasetRecord) {
    setPublishing(dataset.id)
    try {
      const res = await apiFetch(`/api/datasets/${dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !dataset.isPublic }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: DatasetRecord = await res.json()
      setDatasets((prev) => prev.map((d) => (d.id === updated.id ? { ...d, isPublic: updated.isPublic } : d)))
      toast.success(updated.isPublic ? t("published") : t("madePrivate"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedUpdate"))
    } finally {
      setPublishing(null)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(t("confirmDelete", { name }))) return
    setDeleting(id)
    try {
      const response = await apiFetch(`/api/datasets/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      toast.success(t("datasetDeleted"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedDelete"))
    } finally {
      setDeleting(null)
    }
  }

  const ownDatasets = useMemo(() => datasets.filter((d) => d.isOwn), [datasets])
  const normalisedQuery = query.trim().toLowerCase()
  const filteredDatasets = useMemo(() => {
    return ownDatasets.filter((d) => {
      if (statusFilter !== "all" && (d.status ?? DATASET_STATUS.Pending) !== statusFilter) {
        return false
      }
      if (!normalisedQuery) return true
      return d.name.toLowerCase().includes(normalisedQuery)
    })
  }, [ownDatasets, normalisedQuery, statusFilter])

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive font-medium">{t("failedLoad")}</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("myTitle")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("mySubtitle")}</p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href={ROUTES.DATASETS_NEW}>
            <Plus className="h-4 w-4 mr-2" />
            {t("newDataset")}
          </Link>
        </Button>
      </div>

      {ownDatasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium mb-4">{t("emptyDescription")}</p>
          <Button asChild>
            <Link href={ROUTES.DATASETS_NEW}>
              <Plus className="h-4 w-4 mr-2" />
              {t("newDataset")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            resultCount={{ total: ownDatasets.length, shown: filteredDatasets.length }}
            filters={
              <SelectDatasetStatusFilter value={statusFilter} onValueChange={setStatusFilter} />
            }
          />
          {filteredDatasets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {tCommon("noResults")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredDatasets.map((dataset) => (
            <CardDatasetRow
              key={dataset.id}
              dataset={dataset}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={publishing === dataset.id}
                    onClick={() => handleTogglePublic(dataset)}
                  >
                    {publishing === dataset.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : dataset.isPublic ? (
                      <>
                        <Lock className="h-3 w-3 mr-1" />
                        {t("makePrivate")}
                      </>
                    ) : (
                      <>
                        <Globe className="h-3 w-3 mr-1" />
                        {t("makePublic")}
                      </>
                    )}
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <Link href={`/datasets/${dataset.id}`}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">{tCommon("edit")}</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deleting === dataset.id}
                      onClick={() => handleDelete(dataset.id, dataset.name)}
                    >
                      {deleting === dataset.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="sr-only">{tCommon("delete.confirm")}</span>
                    </Button>
                  </div>
                </>
              }
            />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
