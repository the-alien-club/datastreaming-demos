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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

interface AIModel {
  id: number
  name: string
  slug: string
  modelType: string
  provider: { id: number; slug: string; name: string }
}

interface Step {
  name: string
  prompt: string
}

interface McpConfig {
  id: string
  name: string
  description: string | null
  category: string | null
}

interface SubagentRecord {
  id: string
  agentId: string
  name: string
  systemPrompt: string
  model: string | null
  mcpIds: string | null
  datasetId: string | null
}

interface AgentRecord {
  id: string
  workflowId: number
  name: string
  description: string | null
  systemPrompt: string | null
  steps: string | null
  model: string | null
  createdAt: number | null
  updatedAt: number | null
  subagents: SubagentRecord[]
}

interface LibrarySpecialist {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  model: string | null
  mcpIds: string | null
}

const DEFAULT_MODEL = "gpt-4.1-mini"

// ── Subagent form state ────────────────────────────────────────────────────────

interface SubagentFormState {
  name: string
  description: string
  systemPrompt: string
  model: string
  mcpIds: string[]
  /** Present when this subagent was attached from a corpus dataset */
  datasetId?: string | null
}

function emptySubagentForm(): SubagentFormState {
  return { name: "", description: "", systemPrompt: "", model: DEFAULT_MODEL, mcpIds: [] }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AgentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [committingSubagent, setCommittingSubagent] = useState(false)
  const [agent, setAgent] = useState<AgentRecord | null>(null)
  const [models, setModels] = useState<AIModel[]>([])
  const [librarySpecialists, setLibrarySpecialists] = useState<LibrarySpecialist[]>([])
  const [mcpList, setMcpList] = useState<McpConfig[]>([])

  // Editable fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [steps, setSteps] = useState<Step[]>([])
  const [subagents, setSubagents] = useState<SubagentFormState[]>([])

  // Step inline add
  const [addingStep, setAddingStep] = useState(false)
  const [newStepName, setNewStepName] = useState("")
  const [newStepPrompt, setNewStepPrompt] = useState("")

  // Subagent dialog
  const [subagentDialogOpen, setSubagentDialogOpen] = useState(false)
  const [subagentForm, setSubagentForm] = useState<SubagentFormState>(emptySubagentForm())
  const [dialogTab, setDialogTab] = useState<"library" | "new">("library")

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then((r) => r.json()),
      apiFetch("/api/models").then((r) => r.json()).catch(() => []),
      apiFetch("/api/specialists").then((r) => r.json()).catch(() => []),
      apiFetch("/api/mcps").then((r) => r.json()).catch(() => []),
    ])
      .then(([agentData, modelsData, specialistsData, mcpsData]: [AgentRecord, AIModel[], LibrarySpecialist[], McpConfig[]]) => {
        setAgent(agentData)
        setName(agentData.name)
        setDescription(agentData.description ?? "")
        setSystemPrompt(agentData.systemPrompt ?? "")
        setModel(agentData.model ?? DEFAULT_MODEL)
        setSteps(agentData.steps ? JSON.parse(agentData.steps) : [])
        setSubagents(
          agentData.subagents.map((sa) => ({
            name: sa.name,
            description: "",
            systemPrompt: sa.systemPrompt,
            model: sa.model ?? DEFAULT_MODEL,
            mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
            datasetId: sa.datasetId ?? null,
          }))
        )
        setModels(Array.isArray(modelsData) ? modelsData : [])
        setLibrarySpecialists(Array.isArray(specialistsData) ? specialistsData : [])
        setMcpList(Array.isArray(mcpsData) ? mcpsData : [])
      })
      .catch(() => toast.error("Failed to load agent"))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          systemPrompt: systemPrompt.trim(),
          steps,
          model,
          subagents,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      toast.success("Agent saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this agent? This cannot be undone.")) return
    setDeleting(true)
    try {
      const response = await apiFetch(`/api/agents/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      toast.success("Agent deleted")
      router.push("/agents")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent")
      setDeleting(false)
    }
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  function commitStep() {
    if (!newStepName.trim()) {
      toast.error("Step name is required")
      return
    }
    setSteps((prev) => [...prev, { name: newStepName.trim(), prompt: newStepPrompt.trim() }])
    setNewStepName("")
    setNewStepPrompt("")
    setAddingStep(false)
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // ── Subagents ──────────────────────────────────────────────────────────────

  function openSubagentDialog() {
    setSubagentForm(emptySubagentForm())
    setDialogTab(librarySpecialists.length > 0 ? "library" : "new")
    setSubagentDialogOpen(true)
  }

  function toggleMcp(mcpId: string) {
    setSubagentForm((prev) => ({
      ...prev,
      mcpIds: prev.mcpIds.includes(mcpId)
        ? prev.mcpIds.filter((id) => id !== mcpId)
        : [...prev.mcpIds, mcpId],
    }))
  }

  function addFromLibrary(specialist: LibrarySpecialist) {
    setSubagents((prev) => [
      ...prev,
      {
        name: specialist.name,
        description: specialist.description ?? "",
        systemPrompt: specialist.systemPrompt,
        model: specialist.model ?? DEFAULT_MODEL,
        mcpIds: specialist.mcpIds ? JSON.parse(specialist.mcpIds) : [],
      },
    ])
    setSubagentDialogOpen(false)
    toast.success(`Added "${specialist.name}" from library`)
  }

  async function commitSubagent() {
    if (!subagentForm.name.trim() || !subagentForm.systemPrompt.trim()) {
      toast.error("Name and system prompt are required")
      return
    }

    const payload = {
      name: subagentForm.name.trim(),
      description: subagentForm.description.trim() || undefined,
      systemPrompt: subagentForm.systemPrompt.trim(),
      model: subagentForm.model,
      mcpIds: subagentForm.mcpIds,
    }

    setCommittingSubagent(true)
    try {
      const response = await apiFetch("/api/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      const saved: LibrarySpecialist = await response.json()

      setLibrarySpecialists((prev) => [saved, ...prev])
      setSubagents((prev) => [
        ...prev,
        {
          name: saved.name,
          description: saved.description ?? "",
          systemPrompt: saved.systemPrompt,
          model: saved.model ?? DEFAULT_MODEL,
          mcpIds: saved.mcpIds ? JSON.parse(saved.mcpIds) : [],
        },
      ])
      setSubagentDialogOpen(false)
      toast.success(`Specialist "${saved.name}" added to library`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create specialist")
    } finally {
      setCommittingSubagent(false)
    }
  }

  function removeSubagent(index: number) {
    setSubagents((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Agent not found.</p>
        <Button asChild variant="link" className="mt-2 p-0">
          <Link href="/agents">Back to agents</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex-1 truncate">{agent.name}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/agents/${id}/chat`}>
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Chat
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        {/* Basic fields */}
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">System Prompt</Label>
          <Textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-32 resize-y"
            placeholder="You are a helpful assistant..."
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

        <Separator />

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">Steps</h2>
              <p className="text-xs text-muted-foreground">
                Sequential instructions appended to the system prompt.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingStep(true)}
              disabled={addingStep}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add step
            </Button>
          </div>

          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-md border p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{step.name}</p>
                  {step.prompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {step.prompt}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveStep(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx === steps.length - 1}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeStep(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {addingStep && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <Input
                  placeholder="Step name"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  autoFocus
                />
                <Textarea
                  placeholder="Step instructions (optional)"
                  className="min-h-20 resize-y text-sm"
                  value={newStepPrompt}
                  onChange={(e) => setNewStepPrompt(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={commitStep}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingStep(false)
                      setNewStepName("")
                      setNewStepPrompt("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {steps.length === 0 && !addingStep && (
              <p className="text-xs text-muted-foreground py-2">No steps defined.</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Subagents */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">Specialists</h2>
              <p className="text-xs text-muted-foreground">
                Subagents the main agent can delegate to.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={openSubagentDialog}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add specialist
            </Button>
          </div>

          <div className="space-y-2">
            {subagents.map((sa, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-md border p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{sa.name}</p>
                    {sa.datasetId && (
                      <Badge className="text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20">
                        Corpus
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {sa.model ?? DEFAULT_MODEL}
                  </p>
                  {sa.mcpIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sa.mcpIds.map((mcpId) => {
                        const mcp = mcpList.find((m) => m.id === mcpId)
                        return (
                          <Badge key={mcpId} variant="secondary" className="text-xs">
                            {mcp?.name ?? mcpId}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeSubagent(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {subagents.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No specialists defined.</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-3">
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
            Delete agent
          </Button>
        </div>
      </div>

      {/* Subagent dialog */}
      <Dialog open={subagentDialogOpen} onOpenChange={setSubagentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Specialist</DialogTitle>
            <DialogDescription>
              Pick a saved specialist from your library or create a new one for this agent.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={dialogTab}
            onValueChange={(v) => setDialogTab(v as "library" | "new")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="library" className="flex-1">
                From Library
                {librarySpecialists.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                    {librarySpecialists.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1">
                Create New
              </TabsTrigger>
            </TabsList>

            {/* Library tab */}
            <TabsContent value="library">
              {librarySpecialists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                  <BrainCircuit className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No specialists in library yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogTab("new")}
                  >
                    Create one
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto py-1 pr-1">
                  {librarySpecialists.map((s) => {
                    const mcpIds: string[] = s.mcpIds ? JSON.parse(s.mcpIds) : []
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => addFromLibrary(s)}
                      >
                        <p className="text-sm font-medium">{s.name}</p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {s.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <Badge variant="outline" className="text-xs">
                            {s.model ?? DEFAULT_MODEL}
                          </Badge>
                          {mcpIds.map((mcpId) => {
                            const mcp = mcpList.find((m) => m.id === mcpId)
                            return (
                              <Badge key={mcpId} variant="secondary" className="text-xs">
                                {mcp?.name ?? mcpId}
                              </Badge>
                            )
                          })}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSubagentDialogOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* New tab */}
            <TabsContent value="new">
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sa-name">Name *</Label>
                  <Input
                    id="sa-name"
                    placeholder="e.g. Literature Reviewer"
                    value={subagentForm.name}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-desc">
                    Description{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      (shown to main agent for delegation)
                    </span>
                  </Label>
                  <Input
                    id="sa-desc"
                    placeholder="What this specialist is good at..."
                    value={subagentForm.description}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-prompt">System Prompt *</Label>
                  <Textarea
                    id="sa-prompt"
                    className="min-h-24 resize-y text-sm"
                    placeholder="You are a specialist in..."
                    value={subagentForm.systemPrompt}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-model">Model</Label>
                  {models.length === 0 ? (
                    <Input
                      id="sa-model"
                      value={subagentForm.model}
                      onChange={(e) => setSubagentForm((p) => ({ ...p, model: e.target.value }))}
                      placeholder="gpt-4.1-mini"
                    />
                  ) : (
                    <Select
                      value={subagentForm.model}
                      onValueChange={(v) => setSubagentForm((p) => ({ ...p, model: v }))}
                    >
                      <SelectTrigger id="sa-model">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.slug}>
                            <span>{m.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground py-2">No MCP servers configured.</p>
                  ) : (
                    <div className="space-y-4">
                      {Array.from(new Set(mcpList.map((m) => m.category ?? "other"))).map((cat) => (
                        <div key={cat}>
                          <p className="text-xs font-medium text-muted-foreground capitalize tracking-wide mb-1.5">
                            {cat}
                          </p>
                          <div className="space-y-1.5">
                            {mcpList.filter((m) => (m.category ?? "other") === cat).map((mcp) => {
                              const checked = subagentForm.mcpIds.includes(mcp.id)
                              return (
                                <label
                                  key={mcp.id}
                                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 accent-primary"
                                    checked={checked}
                                    onChange={() => toggleMcp(mcp.id)}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{mcp.name}</p>
                                    {mcp.description && (
                                      <p className="text-xs text-muted-foreground">{mcp.description}</p>
                                    )}
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSubagentDialogOpen(false)}
                  disabled={committingSubagent}
                >
                  Cancel
                </Button>
                <Button onClick={commitSubagent} disabled={committingSubagent}>
                  {committingSubagent && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add specialist
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
