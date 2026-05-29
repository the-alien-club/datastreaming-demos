"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, ArrowLeft, Upload, Loader2, RefreshCw, Link2, Pencil, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { timeAgo } from "@/lib/time"
import { DialogDatasetAttachAgent } from "@/components/dialogs/datasets/attach-agent"
import { DATASET_STATUS, ENTRY_STATUS, IN_PROGRESS_ENTRY_STATUSES } from "@/lib/db/schema"
import { ENTRY_POLL_INTERVAL_MS, ROUTES } from "@/lib/constants"

export interface DatasetRecord {
  id: string
  clusterDatasetId: number | null
  name: string
  description: string | null
  status: string | null
  attachedAgents: { id: string; name: string }[]
}

interface ClusterEntry {
  id: number
  name: string
  status: string
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

const IN_PROGRESS_STATUSES = IN_PROGRESS_ENTRY_STATUSES

function EntryStatusBadge({ status }: { status: string }) {
  if (status === ENTRY_STATUS.Processed)
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
        processed
      </Badge>
    )
  if (status === ENTRY_STATUS.Processing || status === ENTRY_STATUS.Uploading)
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 animate-pulse">
        {status}
      </Badge>
    )
  if (status === ENTRY_STATUS.Error)
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">
        error
      </Badge>
    )
  return <Badge variant="secondary">{status}</Badge>
}

function DatasetStatusBadge({ status }: { status: string | null }) {
  const s = status ?? DATASET_STATUS.Pending
  if (s === DATASET_STATUS.Ready)
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
        ready
      </Badge>
    )
  if (s === DATASET_STATUS.Processing)
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
        processing
      </Badge>
    )
  if (s === DATASET_STATUS.Error)
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">
        error
      </Badge>
    )
  return <Badge variant="secondary">{s}</Badge>
}

type DatasetDetailClientProps = {
  initialDataset: DatasetRecord
}

export function DatasetDetailClient({ initialDataset }: DatasetDetailClientProps) {
  const id = initialDataset.id
  const t = useTranslations("datasets.detail")
  const tCommon = useTranslations("common")

  const [dataset, setDataset] = useState<DatasetRecord>(initialDataset)
  const [entries, setEntries] = useState<ClusterEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [entriesError, setEntriesError] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [attachOpen, setAttachOpen] = useState(false)

  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)

  async function handleRename() {
    if (renameDraft === null) return
    const next = renameDraft.trim()
    if (!next) {
      toast.error(tCommon("nameRequired"))
      return
    }
    if (next === dataset.name) {
      setRenameDraft(null)
      return
    }
    setSavingName(true)
    try {
      const res = await apiFetch(`/api/datasets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const updated = await res.json()
      setDataset((prev) => ({ ...prev, name: updated.name }))
      setRenameDraft(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedLoadDataset"))
    } finally {
      setSavingName(false)
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchEntries = useCallback(async (): Promise<ClusterEntry[]> => {
    setEntriesError(false)
    try {
      const res = await apiFetch(`/api/datasets/${id}/entries`)
      if (!res.ok) {
        setEntriesError(true)
        return []
      }
      const data = await res.json()
      const arr: ClusterEntry[] = Array.isArray(data) ? data : []
      setEntries(arr)
      return arr
    } catch {
      setEntriesError(true)
      return []
    } finally {
      setLoadingEntries(false)
    }
  }, [id])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    const hasInProgress = entries.some((e) => IN_PROGRESS_STATUSES.has(e.status as Parameters<typeof IN_PROGRESS_STATUSES.has>[0]))

    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }

    if (hasInProgress) {
      pollingRef.current = setTimeout(() => fetchEntries(), ENTRY_POLL_INTERVAL_MS)
    }

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current)
    }
  }, [entries, fetchEntries])

  async function handleUploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    const files = Array.from(fileList)

    for (const file of files) {
      const formData = new FormData()
      formData.append("file", file)
      try {
        const res = await apiFetch(`/api/datasets/${id}/entries`, {
          method: "POST",
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }))
          toast.error(t("failedUpload", { name: file.name, error: err.error ?? "Unknown error" }))
        }
      } catch {
        toast.error(t("failedUpload", { name: file.name, error: "Unknown error" }))
      }
    }

    setUploading(false)
    toast.success(t("filesUploaded"))
    void fetchEntries()
  }

  async function handleAttached() {
    const res = await apiFetch(`/api/datasets/${id}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    setDataset((prev) => ({ ...prev, ...raw }))
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/datasets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {renameDraft !== null ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleRename()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      setRenameDraft(null)
                    }
                  }}
                  disabled={savingName}
                  className="h-9 text-2xl font-bold w-72 max-w-full"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleRename}
                  disabled={savingName}
                  aria-label={tCommon("save")}
                >
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setRenameDraft(null)}
                  disabled={savingName}
                  aria-label={tCommon("cancel")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold truncate">{dataset.name}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setRenameDraft(dataset.name)}
                  aria-label={tCommon("edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <DatasetStatusBadge status={dataset.status} />
            {(dataset.attachedAgents ?? []).map((a) => (
              <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>
            ))}
          </div>
          {dataset.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{dataset.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            {t("attachToAgent")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoadingEntries(true)
              void fetchEntries()
            }}
            disabled={loadingEntries}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingEntries ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("uploadMore")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx"
            multiple
            className="hidden"
            onChange={(e) => handleUploadFiles(e.target.files)}
          />
        </div>
      </div>

      {loadingEntries ? (
        <div className="rounded-lg border overflow-hidden space-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-2.5 border-b">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : entriesError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive font-medium">{t("failedLoadDataset")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setLoadingEntries(true)
                void fetchEntries()
              }}
            >
              {tCommon("tryAgain") || "Try again"}
            </Button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">{t("noFiles")}</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("colName")}</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("colStatus")}</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("colUploaded")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={entry.id} className={idx !== entries.length - 1 ? "border-b" : ""}>
                  <td className="px-4 py-2.5 font-medium truncate max-w-xs">{entry.name}</td>
                  <td className="px-4 py-2.5">
                    <EntryStatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {timeAgo(entry.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogDatasetAttachAgent
        open={attachOpen}
        onOpenChange={setAttachOpen}
        datasetId={id}
        datasetName={dataset.name}
        onAttached={handleAttached}
      />
    </div>
  )
}
