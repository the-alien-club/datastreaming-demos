"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Database, Globe, Lock, Plus, Trash2, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { timeAgo } from "@/lib/time"

export interface DatasetRecord {
  id: string
  clusterDatasetId: number | null
  name: string
  description: string | null
  status: string | null
  attachedAgentCount: number
  isOwn: boolean
  isPublic: boolean
  createdAt: number | null
  updatedAt: number | null
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending"
  if (s === "ready") return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">ready</Badge>
  if (s === "processing") return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">processing</Badge>
  if (s === "error") return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">error</Badge>
  return <Badge variant="secondary">{s}</Badge>
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
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href="/datasets/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("newDataset")}
          </Link>
        </Button>
      </div>

      {datasets.filter((d) => d.isOwn).length === 0 ? (
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
        <div className="space-y-3">
          {datasets.filter((d) => d.isOwn).map((dataset) => (
            <div
              key={dataset.id}
              className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
            >
              <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{dataset.name}</p>
                  <StatusBadge status={dataset.status} />
                  {dataset.isPublic && (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                      <Globe className="h-3 w-3" />
                      public
                    </Badge>
                  )}
                  {dataset.attachedAgentCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {t("agentsCount", { count: dataset.attachedAgentCount })}
                    </Badge>
                  )}
                </div>
                {dataset.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dataset.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(dataset.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 sm:flex-row sm:items-center">
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
                    <><Lock className="h-3 w-3 mr-1" />{t("makePrivate")}</>
                  ) : (
                    <><Globe className="h-3 w-3 mr-1" />{t("makePublic")}</>
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
              </div>
            </div>
          ))}
        </div>
      )}

      {datasets.filter((d) => !d.isOwn).length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t("publicSection")}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            {datasets.filter((d) => !d.isOwn).map((dataset) => (
              <div
                key={dataset.id}
                className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
              >
                <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{dataset.name}</p>
                    <StatusBadge status={dataset.status} />
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                      <Globe className="h-3 w-3" />
                      public
                    </Badge>
                    {dataset.attachedAgentCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {t("agentsCount", { count: dataset.attachedAgentCount })}
                      </Badge>
                    )}
                  </div>
                  {dataset.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dataset.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{timeAgo(dataset.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
