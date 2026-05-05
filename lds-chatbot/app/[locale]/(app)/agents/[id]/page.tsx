"use client"

import { useState, useEffect, use } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
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

import type { PublicAIModel } from "@/lib/platform/client"
import { providerLabelFromModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { DatasetRecord } from "../../datasets/datasets-view"
import {
  ConversationsListGrouped,
  type ConversationRow,
} from "@/components/conversations-list-grouped"
import { ListToolbarCompact } from "@/components/list-toolbar-compact"

type AIModel = PublicAIModel

interface Step {
  name: string
  prompt: string
}

interface McpConfig {
  id: string
  name: string
  description: string | null
  categories: string[] | null
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
  author: string | null
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

const DEFAULT_MODEL = DEFAULT_MODEL_SLUG

interface SubagentFormState {
  name: string
  description: string
  systemPrompt: string
  model: string
  mcpIds: string[]
  datasetId?: string | null
}

function emptySubagentForm(): SubagentFormState {
  return { name: "", description: "", systemPrompt: "", model: DEFAULT_MODEL, mcpIds: [] }
}

export default function AgentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useTranslations("agentForm")
  const tCommon = useTranslations("common")
  const tDialog = useTranslations("specialistDialog")
  const tAgents = useTranslations("agents")
  const tConversations = useTranslations("conversations")
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [committingSubagent, setCommittingSubagent] = useState(false)
  const [agent, setAgent] = useState<AgentRecord | null>(null)
  const [models, setModels] = useState<AIModel[]>([])
  const [librarySpecialists, setLibrarySpecialists] = useState<LibrarySpecialist[]>([])
  const [mcpList, setMcpList] = useState<McpConfig[]>([])

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [author, setAuthor] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [steps, setSteps] = useState<Step[]>([])
  const [subagents, setSubagents] = useState<SubagentFormState[]>([])

  const [addingStep, setAddingStep] = useState(false)
  const [newStepName, setNewStepName] = useState("")
  const [newStepPrompt, setNewStepPrompt] = useState("")
  const [stepNameError, setStepNameError] = useState(false)

  const [subagentDialogOpen, setSubagentDialogOpen] = useState(false)
  const [subagentForm, setSubagentForm] = useState<SubagentFormState>(emptySubagentForm())
  const [dialogTab, setDialogTab] = useState<"library" | "new">("library")

  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [datasets, setDatasets] = useState<DatasetRecord[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState("")

  // Search filters inside the subagent dialog (Library tab + MCP Tools list)
  const [librarySearch, setLibrarySearch] = useState("")
  const [mcpSearch, setMcpSearch] = useState("")

  const [conversationRows, setConversationRows] = useState<ConversationRow[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/agents/${id}/conversations`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ConversationRow[]) => {
        if (!cancelled) setConversationRows(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setConversationRows([])
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then((r) => r.json()),
      apiFetch("/api/models").then((r) => r.json()).catch(() => []),
      apiFetch("/api/specialists").then((r) => r.json()).catch(() => []),
      apiFetch("/api/mcps").then((r) => r.json()).catch(() => []),
      apiFetch("/api/datasets").then((r) => r.json()).catch(() => []),
    ])
      .then(([agentData, modelsData, specialistsData, mcpsData, datasetsData]: [AgentRecord, AIModel[], LibrarySpecialist[], McpConfig[], DatasetRecord[]]) => {
        setAgent(agentData)
        setName(agentData.name)
        setDescription(agentData.description ?? "")
        setAuthor(agentData.author ?? "")
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
        setDatasets(Array.isArray(datasetsData) ? datasetsData : [])
      })
      .catch(() => toast.error(t("failedLoad")))
      .finally(() => setLoading(false))
  }, [id, t])

  async function handleSave() {
    if (!name.trim()) {
      toast.error(tCommon("nameRequired"))
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
          author: author.trim() || null,
          systemPrompt: systemPrompt.trim(),
          steps,
          model,
          subagents: subagents.map((sa) => ({
            name: sa.name,
            description: sa.description,
            systemPrompt: sa.systemPrompt,
            model: sa.model,
            mcpIds: sa.mcpIds,
            datasetId: sa.datasetId ?? null,
          })),
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      setAgent((prev) => prev ? { ...prev, name: name.trim() } : prev)
      toast.success(t("agentSaved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedSave"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return
    setDeleting(true)
    try {
      const response = await apiFetch(`/api/agents/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      toast.success(t("agentDeleted"))
      router.push("/agents")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedDelete"))
      setDeleting(false)
    }
  }

  function commitStep() {
    if (!newStepName.trim()) {
      setStepNameError(true)
      return
    }
    setSteps((prev) => [...prev, { name: newStepName.trim(), prompt: newStepPrompt.trim() }])
    setNewStepName("")
    setNewStepPrompt("")
    setStepNameError(false)
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
    toast.success(tDialog("addedFromLibrary", { name: specialist.name }))
  }

  async function commitSubagent() {
    if (!subagentForm.name.trim() || !subagentForm.systemPrompt.trim()) {
      toast.error(tCommon("nameRequired"))
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
      toast.success(tDialog("specialistAdded", { name: saved.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tDialog("failedCreate"))
    } finally {
      setCommittingSubagent(false)
    }
  }

  function removeSubagent(index: number) {
    setSubagents((prev) => prev.filter((_, i) => i !== index))
  }


  async function handleAttach() {
    if (!id) {
      toast.error(t("selectAgent"))
      return
    }
    setAttaching(true)
    try {
      const res = await apiFetch(`/api/datasets/${selectedDatasetId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      toast.success(t("attached"))
      setAttachOpen(false)
      setSelectedDatasetId("")
      await apiFetch(`/api/datasets/${selectedDatasetId}`).then((r) => r.json())
      await apiFetch(`/api/agents/${id}`).then(async (r) => {
        const agentData = await r.json() as AgentRecord
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
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedAttach"))
    } finally {
      setAttaching(false)
    }
  }


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
        <p className="text-muted-foreground">{tAgents("notFound")}</p>
        <Button asChild variant="link" className="mt-2 p-0">
          <Link href="/agents">{tAgents("backToAgents")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
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
            {tAgents("chat")}
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">{tCommon("nameLabel")} *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("agentNamePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{tCommon("descriptionLabel")}</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="author">{t("authorLabel")}</Label>
          <Input
            id="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={t("authorPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("authorHint")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">{tCommon("systemPromptLabel")}</Label>
          <Textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-32 resize-y"
            placeholder={t("systemPromptPlaceholder2")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">{tCommon("modelLabel")}</Label>
          {models.length === 0 ? (
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL_SLUG}
            />
          ) : (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue placeholder={tCommon("selectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.slug}>
                    <span>{m.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{providerLabelFromModel(m)}</span>
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
              <h2 className="text-base font-semibold">{t("stepsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("stepsSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingStep(true)}
              disabled={addingStep}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("addStep")}
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
                <div className="space-y-1">
                  <Input
                    placeholder={t("stepNamePlaceholder")}
                    value={newStepName}
                    onChange={(e) => { setNewStepName(e.target.value); if (stepNameError) setStepNameError(false) }}
                    aria-invalid={stepNameError}
                    autoFocus
                  />
                  {stepNameError && (
                    <p className="text-xs text-destructive">{tCommon("nameRequired")}</p>
                  )}
                </div>
                <Textarea
                  placeholder={t("stepInstructionsPlaceholder")}
                  className="min-h-20 resize-y text-sm"
                  value={newStepPrompt}
                  onChange={(e) => setNewStepPrompt(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={commitStep}>
                    {tCommon("add")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingStep(false)
                      setNewStepName("")
                      setNewStepPrompt("")
                      setStepNameError(false)
                    }}
                  >
                    {tCommon("cancel")}
                  </Button>
                </div>
              </div>
            )}

            {steps.length === 0 && !addingStep && (
              <p className="text-xs text-muted-foreground py-2">{t("noSteps")}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Subagents */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-base font-semibold">{t("specialistsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("specialistsSubtitle")}</p>
            </div>
            <div className="flex gap-2 flex-col">
              <Button type="button" variant="outline" size="sm" onClick={openSubagentDialog}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("addSpecialist")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("addDataset")}
              </Button>
            </div>
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
              <p className="text-xs text-muted-foreground py-2">{t("noSpecialists")}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("saveButton")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("deleteButton")}
          </Button>
        </div>

        <Separator />

        {/* Conversations history for this assistant */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{tConversations("title")}</h2>
          {loadingConversations ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tCommon("loading")}
            </div>
          ) : (
            <ConversationsListGrouped rows={conversationRows} showAgentName={false} />
          )}
        </div>
      </div>

      {/* Subagent dialog */}
      <Dialog open={subagentDialogOpen} onOpenChange={setSubagentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tDialog("title")}</DialogTitle>
            <DialogDescription>{tDialog("description")}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={dialogTab}
            onValueChange={(v) => setDialogTab(v as "library" | "new")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="library" className="flex-1">
                {tDialog("fromLibrary")}
                {librarySpecialists.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                    {librarySpecialists.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1">
                {tDialog("createNew")}
              </TabsTrigger>
            </TabsList>

            {/* Library tab */}
            <TabsContent value="library">
              {librarySpecialists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                  <BrainCircuit className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{tDialog("emptyLibrary")}</p>
                  <Button variant="outline" size="sm" onClick={() => setDialogTab("new")}>
                    {tDialog("createOne")}
                  </Button>
                </div>
              ) : (() => {
                const ls = librarySearch.trim().toLowerCase()
                const filteredLib = ls
                  ? librarySpecialists.filter((s) =>
                      s.name.toLowerCase().includes(ls),
                    )
                  : librarySpecialists
                return (
                <div className="space-y-2 py-1">
                  <ListToolbarCompact
                    query={librarySearch}
                    onQueryChange={setLibrarySearch}
                  />
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredLib.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {tCommon("noResults")}
                      </p>
                    ) : filteredLib.map((s) => {
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
                </div>
                )
              })()}
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSubagentDialogOpen(false)}>
                  {tCommon("cancel")}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* New tab */}
            <TabsContent value="new">
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <Label htmlFor="sa-name">{tDialog("nameLabel")}</Label>
                  <Input
                    id="sa-name"
                    placeholder={tDialog("namePlaceholder")}
                    value={subagentForm.name}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-desc">
                    {tDialog("descLabel")}{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      {tDialog("descHint")}
                    </span>
                  </Label>
                  <Input
                    id="sa-desc"
                    placeholder={tDialog("descHint")}
                    value={subagentForm.description}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-prompt">{tDialog("promptLabel")}</Label>
                  <Textarea
                    id="sa-prompt"
                    className="min-h-24 resize-y text-sm"
                    placeholder={tDialog("promptPlaceholder")}
                    value={subagentForm.systemPrompt}
                    onChange={(e) => setSubagentForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-model">{tCommon("modelLabel")}</Label>
                  {models.length === 0 ? (
                    <Input
                      id="sa-model"
                      value={subagentForm.model}
                      onChange={(e) => setSubagentForm((p) => ({ ...p, model: e.target.value }))}
                      placeholder={DEFAULT_MODEL_SLUG}
                    />
                  ) : (
                    <Select
                      value={subagentForm.model}
                      onValueChange={(v) => setSubagentForm((p) => ({ ...p, model: v }))}
                    >
                      <SelectTrigger id="sa-model">
                        <SelectValue placeholder={tCommon("selectModel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.slug}>
                            <span>{m.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {providerLabelFromModel(m)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{tCommon("mcpToolsLabel")}</Label>
                  {mcpList.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{tCommon("noMcps")}</p>
                  ) : (() => {
                    const ms = mcpSearch.trim().toLowerCase()
                    const filteredMcps = ms
                      ? mcpList.filter((m) => m.name.toLowerCase().includes(ms))
                      : mcpList
                    const primaryCat = (m: McpConfig) => m.categories?.[0] ?? "other"
                    const cats = Array.from(new Set(filteredMcps.map(primaryCat)))
                    return (
                    <div className="space-y-2">
                      <ListToolbarCompact query={mcpSearch} onQueryChange={setMcpSearch} />
                      <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                        {filteredMcps.length === 0 ? (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            {tCommon("noResults")}
                          </p>
                        ) : cats.map((cat) => (
                        <div key={cat}>
                          <p className="text-xs font-medium text-muted-foreground capitalize tracking-wide mb-1.5">
                            {cat}
                          </p>
                          <div className="space-y-1.5">
                            {filteredMcps.filter((m) => primaryCat(m) === cat).map((mcp) => {
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
                    </div>
                    )
                  })()}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSubagentDialogOpen(false)}
                  disabled={committingSubagent}
                >
                  {tCommon("cancel")}
                </Button>
                <Button onClick={commitSubagent} disabled={committingSubagent}>
                  {committingSubagent && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tDialog("addSpecialist")}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("datasetAttachDialog.title")}</DialogTitle>
            <DialogDescription>{t("datasetAttachDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("datasetAttachDialog.body", { name: agent.name })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="dataset-select">{t("datasetAttachDialog.label")}</Label>
              {datasets.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">{t("datasetAttachDialog.noDatasets")}</p>
              ) : (
                <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                  <SelectTrigger id="dataset-select">
                    <SelectValue placeholder={t("datasetAttachDialog.selectDataset")} />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
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
            <Button onClick={handleAttach} disabled={attaching || !selectedDatasetId}>
              {attaching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("datasetAttachDialog.attach")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
