"use client"

import { useState, useEffect } from "react"
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

interface McpConfig {
  id: string
  name: string
  description: string | null
  category: string | null
}

export default function NewSpecialistPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [models, setModels] = useState<AIModel[]>([])
  const [mcpList, setMcpList] = useState<McpConfig[]>([])

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState("gpt-4.1-mini")
  const [mcpIds, setMcpIds] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      apiFetch("/api/models").then((r) => r.json()).catch(() => []),
      apiFetch("/api/mcps").then((r) => r.json()).catch(() => []),
    ]).then(([modelsData, mcpsData]: [AIModel[], McpConfig[]]) => {
      setModels(Array.isArray(modelsData) ? modelsData : [])
      setMcpList(Array.isArray(mcpsData) ? mcpsData : [])
    })
  }, [])

  function toggleMcp(mcpId: string) {
    setMcpIds((prev) =>
      prev.includes(mcpId) ? prev.filter((id) => id !== mcpId) : [...prev, mcpId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!systemPrompt.trim()) {
      toast.error("System prompt is required")
      return
    }

    setSubmitting(true)
    try {
      const response = await apiFetch("/api/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim(),
          model,
          mcpIds,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }

      const specialist = await response.json()
      toast.success("Specialist created")
      router.push(`/specialists/${specialist.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create specialist")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/specialists">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Specialist</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="e.g. Literature Reviewer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
            placeholder="What this specialist is good at..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">System Prompt *</Label>
          <Textarea
            id="systemPrompt"
            placeholder="You are a specialist in..."
            className="min-h-32 resize-y"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
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
                    <span className="ml-2 text-muted-foreground text-xs">
                      {m.provider.name}
                    </span>
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
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Specialist
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/specialists">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
