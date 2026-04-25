"use client"

import { useState, useEffect, useRef, use, useCallback } from "react"
import Link from "next/link"
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

function timeAgo(ts: string | Date | null | undefined): string {
  if (!ts) return ""
  const ms = Date.now() - new Date(ts).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Status badge ───────────────────────────────────────────────────────────────

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
  // pending, uploaded, or anything else
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [dataset, setDataset] = useState<DatasetRecord | null>(null)
  const [entries, setEntries] = useState<ClusterEntry[]>([])
  const [loadingDataset, setLoadingDataset] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Attach dialog
  const [attachOpen, setAttachOpen] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [attaching, setAttaching] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data fetchers ────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/datasets/${id}/entries`)
      if (!res.ok) return
      const data = await res.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch {
      // silently ignore polling errors
    } finally {
      setLoadingEntries(false)
    }
  }, [id])

  useEffect(() => {
    apiFetch(`/api/datasets/${id}`)
      .then((r) => r.json())
      .then((data) => setDataset(data))
      .catch(() => toast.error("Failed to load dataset"))
      .finally(() => setLoadingDataset(false))

    fetchEntries()
  }, [id, fetchEntries])

  // Polling: restart when entries change
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

  // ── Upload more ──────────────────────────────────────────────────────────────

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
          toast.error(`Failed to upload ${file.name}: ${err.error ?? "Unknown error"}`)
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`)
      }
    }

    setUploading(false)
    toast.success("Files uploaded")
    await fetchEntries()
  }

  // ── Attach to agent ──────────────────────────────────────────────────────────

  async function openAttachDialog() {
    setAttachOpen(true)
    if (agents.length === 0) {
      try {
        const res = await apiFetch("/api/agents")
        const data = await res.json()
        setAgents(Array.isArray(data) ? data : [])
      } catch {
        toast.error("Failed to load agents")
      }
    }
  }

  async function handleAttach() {
    if (!selectedAgentId) {
      toast.error("Please select an agent")
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
      toast.success("Dataset attached to agent as corpus specialist")
      setAttachOpen(false)
      setSelectedAgentId("")
      const updated = await apiFetch(`/api/datasets/${id}`).then((r) => r.json())
      setDataset(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to attach")
    } finally {
      setAttaching(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
        <p className="text-muted-foreground">Dataset not found.</p>
        <Button asChild variant="link" className="mt-2 p-0">
          <Link href="/datasets">Back to datasets</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
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
            Attach to agent
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
            Refresh
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
            Upload more
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

      {/* Entries table */}
      {loadingEntries ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">No files yet. Upload some documents.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Uploaded</th>
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

      {/* Attach to agent dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Attach to Agent</DialogTitle>
            <DialogDescription>
              Choose an agent. A corpus specialist for this dataset will be added to its workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              This will add a corpus specialist subagent to the selected agent, scoped to the{" "}
              <strong>{dataset.name}</strong> dataset.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="agent-select">Agent</Label>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">No agents found.</p>
              ) : (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger id="agent-select">
                    <SelectValue placeholder="Select an agent" />
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
              Cancel
            </Button>
            <Button
              onClick={handleAttach}
              disabled={attaching || !selectedAgentId}
            >
              {attaching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
