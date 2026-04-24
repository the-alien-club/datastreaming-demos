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

interface AIModel {
  id: number
  name: string
  slug: string
  modelType: string
  provider: { id: number; slug: string; name: string }
}

export default function NewAgentPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [models, setModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState("mistral-small-latest")

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: AIModel[]) => {
        setModels(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        // Models endpoint may not be reachable in all envs; fall back silently
      })
      .finally(() => setLoadingModels(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Name is required")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          model,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }

      const agent = await response.json()
      toast.success("Agent created")
      router.push(`/agents/${agent.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create agent")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Agent</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="e.g. Research Assistant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            placeholder="What does this agent do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">System Prompt</Label>
          <Textarea
            id="systemPrompt"
            placeholder="You are a helpful research assistant..."
            className="min-h-32 resize-y"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          {loadingModels || models.length === 0 ? (
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="mistral-small-latest"
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

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Agent
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/agents">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
