"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Step } from "@/components/ui/step"
import { Wizard } from "@/components/ui/wizard"
import { apiFetch } from "@/lib/api-fetch"
import type { PublicAIModel } from "@/lib/platform/client"
import { TemplateStepContent, suggestDatasetName } from "./steps/template"
import { IdentityStepContent } from "./steps/identity"
import { SpecialistStepContent } from "./steps/specialist"
import { McpStepContent } from "./steps/mcp"
import { KnowledgeStepContent } from "./steps/knowledge"
import { DoneStepContent } from "./steps/done"
import { createInitialState, type WizardState } from "./state"
import {
  WIZARD_AGENT_TEMPLATES,
  WIZARD_SPECIALIST_TEMPLATES,
} from "./templates"
import { markWizardSeen } from "./wizard-context"

interface StartWizardProps {
  onClose: () => void
}

export function StartWizard({ onClose }: StartWizardProps) {
  const router = useRouter()
  const t = useTranslations("wizard")
  const [state, setState] = useState<WizardState>(createInitialState)
  const [models, setModels] = useState<PublicAIModel[]>([])
  const [uploadInFlight, setUploadInFlight] = useState(false)

  const agentIdRef = useRef<string | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    agentIdRef.current = state.agentId
  }, [state.agentId])

  useEffect(() => {
    return () => {
      if (agentIdRef.current && !completedRef.current) {
        apiFetch(`/api/agents/${agentIdRef.current}`, { method: "DELETE" }).catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    apiFetch("/api/models")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PublicAIModel[]) => {
        setModels(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
  }, [])

  const trimmedName = state.name.trim()
  const trimmedSpecialistName = state.specialistName.trim()

  const template = WIZARD_AGENT_TEMPLATES.find((tpl) => tpl.id === state.templateId)
  const knowledgeRequired = template?.knowledgeRequired ?? false

  const knowledgeCanProceed = (() => {
    if (state.knowledgeMode === "skip") return !knowledgeRequired
    if (state.knowledgeMode === "existing") return state.selectedExistingDatasetIds.length > 0
    if (state.knowledgeMode === "upload") {
      return (
        state.uploadedDatasetIds.length > 0 ||
        (state.uploadFiles.length > 0 && state.uploadDatasetName.trim().length > 0)
      )
    }
    return false
  })()

  return (
    <Wizard
      onCancel={onClose}
      cancelLabel={t("cancel")}
      submitLabel={t("startChatting")}
      backLabel={t("back")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <Step
        label={t("step1Label")}
        canProceed={() => state.templateId !== null}
        onBeforeNext={async () => {
          const tpl = WIZARD_AGENT_TEMPLATES.find((tpl) => tpl.id === state.templateId)
          if (!tpl) return false
          const specialist = WIZARD_SPECIALIST_TEMPLATES.find(
            (s) => s.id === tpl.suggestedSpecialistId,
          )
          const tplName = tpl.isBlank ? "" : t(`tpl_${tpl.id}_name` as never)
          const tplDesc = t(`tpl_${tpl.id}_desc` as never)
          const translatedSpecialistName = specialist && !specialist.isCustom
            ? t(`sp_${specialist.id}_name` as never)
            : ""
          const translatedSpecialistPrompt = specialist
            ? t(`sp_${specialist.id}_prompt` as never)
            : ""
          const translatedAgentPrompt = tpl.isBlank
            ? ""
            : t(`tpl_${tpl.id}_prompt` as never)

          setState((prev) => ({
            ...prev,
            name: tpl.isBlank ? prev.name : (prev.name || tplName),
            description: prev.description || tplDesc,
            systemPrompt: translatedAgentPrompt,
            specialistTemplateId: tpl.suggestedSpecialistId,
            specialistName: translatedSpecialistName,
            specialistSystemPrompt: translatedSpecialistPrompt,
            selectedMcpIds: [...tpl.suggestedMcpIds],
            knowledgeMode: tpl.knowledgeRequired ? "upload" : prev.knowledgeMode,
            uploadDatasetName: prev.uploadDatasetName || suggestDatasetName(tpl.id, t),
          }))
          return true
        }}
      >
        <TemplateStepContent state={state} setState={setState} />
      </Step>

      <Step
        label={t("step2Label")}
        canProceed={() => trimmedName.length >= 3}
        onBeforeNext={async () => {
          if (state.agentId) return true
          const tpl = WIZARD_AGENT_TEMPLATES.find((tpl) => tpl.id === state.templateId)
          try {
            const response = await apiFetch("/api/agents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: trimmedName,
                description: state.description.trim() || undefined,
                systemPrompt: state.systemPrompt,
                model: state.model,
                steps: [],
                subagents: [],
                starterPrompts: tpl && !tpl.isBlank
                  ? tpl.starterPrompts.map((_, i) =>
                      t(`tpl_${tpl.id}_start${i + 1}` as never)
                    ).filter(Boolean)
                  : [],
              }),
            })
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: "Unknown error" }))
              throw new Error(err.error ?? `HTTP ${response.status}`)
            }
            const agent = (await response.json()) as { id: string }
            setState((prev) => ({ ...prev, agentId: agent.id }))
            return true
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errCreateAgent"))
            return false
          }
        }}
      >
        <IdentityStepContent state={state} setState={setState} models={models} />
      </Step>

      <Step
        label={t("step3Label")}
        description={t("step3Description")}
        canProceed={() =>
          state.specialistTemplateId !== null && trimmedSpecialistName.length >= 3
        }
        onBeforeNext={async () => true}
      >
        <SpecialistStepContent state={state} setState={setState} />
      </Step>

      <Step
        label={t("step4Label")}
        canProceed={() => true}
        onBeforeNext={async () => {
          if (!state.agentId) {
            toast.error(t("errAgentMissingRetry"))
            return false
          }
          if (state.specialistSubagentId) return true
          try {
            const response = await apiFetch(`/api/agents/${state.agentId}/subagents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: trimmedSpecialistName,
                systemPrompt: state.specialistSystemPrompt,
                model: state.specialistModel,
                mcpIds: state.selectedMcpIds,
              }),
            })
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: "Unknown error" }))
              throw new Error(err.error ?? `HTTP ${response.status}`)
            }
            const subagent = (await response.json()) as { id: string }
            setState((prev) => ({ ...prev, specialistSubagentId: subagent.id }))
            return true
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errAddSpecialist"))
            return false
          }
        }}
      >
        <McpStepContent state={state} setState={setState} />
      </Step>

      <Step
        label={t("step5Label")}
        description={
          template
            ? t(`tpl_${template.id}_knowledge` as never) || t("step5Label")
            : t("step5Label")
        }
        canProceed={() => knowledgeCanProceed && !uploadInFlight}
        onBeforeNext={async () => {
          if (!state.agentId) {
            toast.error(t("errAgentMissing"))
            return false
          }

          let uploadedHere: string[] = []
          if (
            state.knowledgeMode === "upload" &&
            state.uploadedDatasetIds.length === 0 &&
            state.uploadFiles.length > 0
          ) {
            setUploadInFlight(true)
            try {
              uploadedHere = await uploadWizardCorpus(state)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("errUploadFailed"))
              return false
            } finally {
              setUploadInFlight(false)
            }
            setState((prev) => ({
              ...prev,
              uploadedDatasetIds: [...prev.uploadedDatasetIds, ...uploadedHere],
            }))
          }

          const datasetIdsToAttach: string[] = []
          if (state.knowledgeMode === "existing") {
            datasetIdsToAttach.push(...state.selectedExistingDatasetIds)
          } else if (state.knowledgeMode === "upload") {
            datasetIdsToAttach.push(...state.uploadedDatasetIds, ...uploadedHere)
          }

          const newOnes = datasetIdsToAttach.filter(
            (id) => !state.attachedDatasetIds.includes(id),
          )

          for (const datasetId of newOnes) {
            try {
              const response = await apiFetch(`/api/datasets/${datasetId}/attach`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: state.agentId }),
              })
              if (!response.ok && response.status !== 409) {
                const err = await response.json().catch(() => ({ error: "Unknown error" }))
                throw new Error(err.error ?? `HTTP ${response.status}`)
              }
              setState((prev) => ({
                ...prev,
                attachedDatasetIds: [...prev.attachedDatasetIds, datasetId],
              }))
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("errAttachDataset"))
              return false
            }
          }

          return true
        }}
      >
        <KnowledgeStepContent
          state={state}
          setState={setState}
          uploadInFlight={uploadInFlight}
        />
      </Step>

      <Step
        label={t("step6Label")}
        onBeforeNext={async () => {
          if (!state.agentId) return false
          completedRef.current = true
          router.push(`/agents/${state.agentId}/chat`)
          markWizardSeen()
          onClose()
          return false
        }}
      >
        <DoneStepContent
          state={state}
          onClose={onClose}
          onComplete={() => {
            completedRef.current = true
            markWizardSeen()
            onClose()
          }}
        />
      </Step>
    </Wizard>
  )
}

async function uploadWizardCorpus(state: WizardState): Promise<string[]> {
  const datasetName = state.uploadDatasetName.trim()
  if (!datasetName) throw new Error("Dataset name is required")
  if (state.uploadFiles.length === 0) throw new Error("Add at least one file")

  const createResponse = await apiFetch("/api/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: datasetName,
      description: `Uploaded via the Start wizard for "${state.name}"`,
    }),
  })
  if (!createResponse.ok) {
    const err = await createResponse.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${createResponse.status}`)
  }
  const dataset = (await createResponse.json()) as { id: string }

  const formData = new FormData()
  for (const file of state.uploadFiles) {
    formData.append("file", file)
  }
  const uploadResponse = await apiFetch(`/api/datasets/${dataset.id}/entries`, {
    method: "POST",
    body: formData,
  })
  if (!uploadResponse.ok) {
    const err = await uploadResponse.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${uploadResponse.status}`)
  }

  return [dataset.id]
}
