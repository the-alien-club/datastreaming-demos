"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Database, Globe, Lock, Plus, Trash2, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { DatasetRow, type DatasetRowData } from "@/components/cards/dataset-row"
import { ListToolbar } from "@/components/list-toolbar"

export interface DatasetRecord extends DatasetRowData {
  clusterDatasetId: number | null
  isOwn: boolean
  updatedAt: number | null
}

export default function DatasetsPage() {
  const t = useTranslations("datasets")
  const tCommon = useTranslations("common")
  const [datasets, setDatasets] = useState<DatasetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)

  useEffect(() => {
    apiFetch("/api/datasets")
      .then((r) => r.json())
      .then((data) => setDatasets(Array.isArray(data) ? data : []))
      .catch(() => toast.error(t("failedLoad")))
      .finally(() => setLoading(false))
  }, [t])

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
      if (statusFilter !== "all" && (d.status ?? "pending") !== statusFilter) {
        return false
      }
      if (!normalisedQuery) return true
      return d.name.toLowerCase().includes(normalisedQuery)
    })
  }, [ownDatasets, normalisedQuery, statusFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          <Link href="/datasets/new">
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
            <Link href="/datasets/new">
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
          {filteredDatasets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {tCommon("noResults")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredDatasets.map((dataset) => (
            <DatasetRow
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
                      <span className="sr-only">{tCommon("delete")}</span>
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
