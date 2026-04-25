"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

interface AIModel {
  id: number
  name: string
  slug: string
  modelType: string
  provider: { id: number; slug: string; name: string }
}

interface SpecialistRecord {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  model: string | null
  mcpIds: string | null
}

interface McpConfig {
  id: string
  name: string
  description: string | null
  category: string | null
}

const DEFAULT_MODEL = "gpt-4.1-mini"

export default function SpecialistEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [specialist, setSpecialist] = useState<SpecialistRecord | null>(null)
  const [models, setModels] = useState<AIModel[]>([])
  const [mcpList, setMcpList] = useState<McpConfig[]>([])

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [mcpIds, setMcpIds] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/specialists/${id}`).then((r) => r.json()),
      apiFetch("/api/models").then((r) => r.json()).catch(() => []),
      apiFetch("/api/mcps").then((r) => r.json()).catch(() => []),
    ])
      .then(([data, modelsData, mcpsData]: [SpecialistRecord, AIModel[], McpConfig[]]) => {
        setSpecialist(data)
        setName(data.name)
        setDescription(data.description ?? "")
        setSystemPrompt(data.systemPrompt)
        setModel(data.model ?? DEFAULT_MODEL)
        setMcpIds(data.mcpIds ? JSON.parse(data.mcpIds) : [])
        setModels(Array.isArray(modelsData) ? modelsData : [])
        setMcpList(Array.isArray(mcpsData) ? mcpsData : [])
      })
      .catch(() => toast.error("Failed to load specialist"))
      .finally(() => setLoading(false))
  }, [id])

  function toggleMcp(mcpId: string) {
    setMcpIds((prev) =>
      prev.includes(mcpId) ? prev.filter((m) => m !== mcpId) : [...prev, mcpId]
    )
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!systemPrompt.trim()) {
      toast.error("System prompt is required")
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(`/api/specialists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          systemPrompt: systemPrompt.trim(),
          model,
          mcpIds,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      toast.success("Specialist saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save specialist")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this specialist? This cannot be undone.")) return
    setDeleting(true)
    try {
      const response = await apiFetch(`/api/specialists/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      toast.success("Specialist deleted")
      router.push("/specialists")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete specialist")
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!specialist) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Specialist not found.</p>
        <Button asChild variant="link" className="mt-2 p-0">
          <Link href="/specialists">Back to specialists</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/specialists">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex-1 truncate">{specialist.name}</h1>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Specialist name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">
            Description{" "}
            <span className="text-muted-foreground text-xs font-normal">
              (shown to main agent for delegation)
            </span>
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this specialist is good at..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">System Prompt *</Label>
          <Textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-32 resize-y"
            placeholder="You are a specialist in..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          {models.length === 0 ? (
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1-mini"
            />
          ) : (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.slug}>
                    <span>{m.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{m.provider.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>MCP Tools</Label>
          {mcpList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No MCPs registered.{" "}
              <Link href="/mcps" className="underline">Add one</Link> to enable tools.
            </p>
          ) : (
            <div className="space-y-2">
              {mcpList.map((mcp) => (
                <label
                  key={mcp.id}
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={mcpIds.includes(mcp.id)}
                    onChange={() => toggleMcp(mcp.id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{mcp.name}</p>
                    {mcp.description && (
                      <p className="text-xs text-muted-foreground">{mcp.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete specialist
          </Button>
        </div>
      </div>
    </div>
  )
}
