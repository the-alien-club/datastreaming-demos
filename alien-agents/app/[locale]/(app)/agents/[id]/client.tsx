"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

import type { PublicAIModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import type { DatasetRecord } from "../../datasets/client"
import {
  ConversationsListGrouped,
  type ConversationRow,
} from "@/components/conversations-list-grouped"
import { DialogAgentAddSubagent } from "@/components/dialogs/agents/add-subagent"
import { DialogAgentAttachDataset } from "@/components/dialogs/agents/attach-dataset"
import {
  FormAgentEdit,
  type FormAgentEditData,
} from "@/components/forms/agents/edit"

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

export interface AgentRecord {
  id: string
  workflowId: number | null
  name: string
  description: string | null
  author: string | null
  systemPrompt: string | null
  steps: string | null
  model: string | null
  isForkable: boolean
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

type AgentDetailClientProps = {
  initialAgent: AgentRecord
  initialModels: AIModel[]
  initialLibrarySpecialists: LibrarySpecialist[]
  initialMcpList: McpConfig[]
  initialDatasets: DatasetRecord[]
  initialConversationRows: ConversationRow[]
}

export function AgentDetailClient({
  initialAgent,
  initialModels,
  initialLibrarySpecialists,
  initialMcpList,
  initialDatasets,
  initialConversationRows,
}: AgentDetailClientProps) {
  const { id } = initialAgent
  const t = useTranslations("agents.form")
  const tCommon = useTranslations("common")
  const tAgents = useTranslations("agents")
  const tConversations = useTranslations("conversations")
  const router = useRouter()

  const [deleting, setDeleting] = useState(false)
  const [agent, setAgent] = useState<AgentRecord>(initialAgent)
  const [librarySpecialists, setLibrarySpecialists] = useState<LibrarySpecialist[]>(initialLibrarySpecialists)

  const [subagents, setSubagents] = useState<SubagentFormState[]>(
    initialAgent.subagents.map((sa) => ({
      name: sa.name,
      description: "",
      systemPrompt: sa.systemPrompt,
      model: sa.model ?? DEFAULT_MODEL,
      mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
      datasetId: sa.datasetId ?? null,
    }))
  )

  const [saving, setSaving] = useState(false)
  const [subagentDialogOpen, setSubagentDialogOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)

  const [conversationRows] = useState<ConversationRow[]>(initialConversationRows)

  async function handleSave(data: FormAgentEditData) {
    setSaving(true)
    const response = await apiFetch(`/api/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description?.trim() || null,
        author: data.author?.trim() || null,
        createdAt: data.createdAt || undefined,
        systemPrompt: data.systemPrompt.trim(),
        steps: data.steps,
        model: data.model,
        isForkable: data.isForkable,
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
    setAgent((prev) => ({ ...prev, name: data.name.trim() }))
    toast.success(t("agentSaved"))
    setSaving(false)
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

  function removeSubagent(index: number) {
    setSubagents((prev) => prev.filter((_, i) => i !== index))
  }

  const initialSteps: Step[] = initialAgent.steps ? JSON.parse(initialAgent.steps) : []

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
        <FormAgentEdit
          initialValues={{
            name: initialAgent.name,
            description: initialAgent.description ?? "",
            author: initialAgent.author ?? "",
            createdAt: initialAgent.createdAt
              ? new Date(initialAgent.createdAt).toISOString().slice(0, 10)
              : "",
            systemPrompt: initialAgent.systemPrompt ?? "",
            model: initialAgent.model ?? DEFAULT_MODEL,
            steps: initialSteps,
            isForkable: initialAgent.isForkable,
          }}
          models={initialModels}
          hideSubmit
          onSubmit={async (data) => {
            try {
              await handleSave(data)
            } catch (err) {
              setSaving(false)
              toast.error(err instanceof Error ? err.message : t("failedSave"))
              throw err
            }
          }}
        />

        <Separator />

        {/* Subagents */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-base font-semibold">{t("specialistsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("specialistsSubtitle")}</p>
            </div>
            <div className="flex gap-2 flex-col">
              <Button type="button" variant="outline" size="sm" onClick={() => setSubagentDialogOpen(true)}>
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
                        const mcp = initialMcpList.find((m) => m.id === mcpId)
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

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            form="agent-edit-form"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("saveButton")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("deleteButton")}
          </Button>
        </div>

        <Separator />

        {/* Conversations history for this assistant */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{tConversations("title")}</h2>
          <ConversationsListGrouped rows={conversationRows} showAgentName={false} />
        </div>
      </div>

      <DialogAgentAddSubagent
        open={subagentDialogOpen}
        onOpenChange={setSubagentDialogOpen}
        models={initialModels}
        mcpList={initialMcpList}
        librarySpecialists={librarySpecialists}
        onSpecialistCreated={(saved) =>
          setLibrarySpecialists((prev) => [saved, ...prev])
        }
        onSubagentAdded={(subagent) =>
          setSubagents((prev) => [...prev, subagent])
        }
      />

      <DialogAgentAttachDataset
        open={attachOpen}
        onOpenChange={setAttachOpen}
        agentId={id}
        agentName={agent.name}
        datasets={initialDatasets}
        onAttached={setSubagents}
      />
    </div>
  )
}
