"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Database, Plus, Trash2, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { timeAgo } from "@/lib/time"

interface DatasetRecord {
  id: string
  clusterDatasetId: number | null
  name: string
  description: string | null
  status: string | null
  attachedAgentCount: number
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
  const [datasets, setDatasets] = useState<DatasetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    apiFetch("/api/datasets")
      .then((r) => r.json())
      .then((data) => setDatasets(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load datasets"))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete dataset "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      const response = await apiFetch(`/api/datasets/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      toast.success("Dataset deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete dataset")
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
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Datasets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload and manage document corpora for your agents.
          </p>
        </div>
        <Button asChild>
          <Link href="/datasets/new">
            <Plus className="h-4 w-4 mr-2" />
            New dataset
          </Link>
        </Button>
      </div>

      {datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium mb-4">No datasets yet. Create your first dataset.</p>
          <Button asChild>
            <Link href="/datasets/new">
              <Plus className="h-4 w-4 mr-2" />
              New dataset
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
            >
              <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{dataset.name}</p>
                  <StatusBadge status={dataset.status} />
                  {dataset.attachedAgentCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {dataset.attachedAgentCount} {dataset.attachedAgentCount === 1 ? "agent" : "agents"}
                    </Badge>
                  )}
                </div>
                {dataset.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {dataset.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {timeAgo(dataset.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href={`/datasets/${dataset.id}`}>
                    <Eye className="h-4 w-4" />
                    <span className="sr-only">View</span>
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
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
