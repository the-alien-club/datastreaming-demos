"use client"

import { useState, useEffect, useRef, use, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Upload, Loader2, RefreshCw, Link2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { timeAgo } from "@/lib/time"

interface DatasetRecord {
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

interface AgentRecord {
  id: string
  name: string
}

const IN_PROGRESS_STATUSES = new Set(["pending", "uploading", "processing"])

function EntryStatusBadge({ status }: { status: string }) {
  if (status === "processed")
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
        processed
      </Badge>
    )
  if (status === "processing" || status === "uploading")
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 animate-pulse">
        {status}
      </Badge>
    )
  if (status === "error")
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">
        error
      </Badge>
    )
  return <Badge variant="secondary">{status}</Badge>
}

function DatasetStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending"
  if (s === "ready")
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
        ready
      </Badge>
    )
  if (s === "processing")
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
        processing
      </Badge>
    )
  if (s === "error")
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">
        error
      </Badge>
    )
  return <Badge variant="secondary">{s}</Badge>
}

export default function DatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useTranslations("datasetDetail")
  const tCommon = useTranslations("common")

  const [dataset, setDataset] = useState<DatasetRecord | null>(null)
  const [entries, setEntries] = useState<ClusterEntry[]>([])
  const [loadingDataset, setLoadingDataset] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [attachOpen, setAttachOpen] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [attaching, setAttaching] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchEntries = useCallback(async (): Promise<ClusterEntry[]> => {
    try {
      const res = await apiFetch(`/api/datasets/${id}/entries`)
      if (!res.ok) return []
      const data = await res.json()
      const arr: ClusterEntry[] = Array.isArray(data) ? data : []
      setEntries(arr)
      return arr
    } catch {
      return []
    } finally {
      setLoadingEntries(false)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const res = await apiFetch(`/api/datasets/${id}`)
        const data = await res.json()
        if (!cancelled) setDataset(data)
      } catch {
        if (!cancelled) toast.error(t("failedLoadDataset"))
      } finally {
        if (!cancelled) setLoadingDataset(false)
      }
      await fetchEntries()
    })()

    return () => {
      cancelled = true
    }
  }, [id, fetchEntries, t])

  useEffect(() => {
    const hasInProgress = entries.some((e) => IN_PROGRESS_STATUSES.has(e.status))

    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }

    if (hasInProgress) {
      pollingRef.current = setTimeout(() => fetchEntries(), 10_000)
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
    await fetchEntries()
  }

  async function openAttachDialog() {
    setAttachOpen(true)
    if (agents.length === 0) {
      try {
        const res = await apiFetch("/api/agents")
        const data = await res.json()
        setAgents(Array.isArray(data) ? data : [])
      } catch {
        toast.error(t("failedLoadAgents"))
      }
    }
  }

  async function handleAttach() {
    if (!selectedAgentId) {
      toast.error(t("selectAgent"))
      return
    }
    setAttaching(true)
    try {
      const res = await apiFetch(`/api/datasets/${id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      toast.success(t("attached"))
      setAttachOpen(false)
      setSelectedAgentId("")
      const updated = await apiFetch(`/api/datasets/${id}`).then((r) => r.json())
      setDataset(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedAttach"))
    } finally {
      setAttaching(false)
    }
  }

  if (loadingDataset) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button asChild variant="link" className="mt-2 p-0">
          <Link href="/datasets">{t("backToDatasets")}</Link>
        </Button>
      </div>
    )
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
            <h1 className="text-2xl font-bold truncate">{dataset.name}</h1>
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
          <Button variant="outline" size="sm" onClick={openAttachDialog}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            {t("attachToAgent")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoadingEntries(true)
              fetchEntries()
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
            <DialogDescription>{t("attachDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("attachDialogBody", { name: dataset.name })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="agent-select">{t("agentLabel")}</Label>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">{t("noAgents")}</p>
              ) : (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger id="agent-select">
                    <SelectValue placeholder={t("selectAgent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)} disabled={attaching}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleAttach} disabled={attaching || !selectedAgentId}>
              {attaching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("attach")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
