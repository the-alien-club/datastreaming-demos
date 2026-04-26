"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
  const [state, setState] = useState<WizardState>(createInitialState)
  const [models, setModels] = useState<PublicAIModel[]>([])

  // Refs for unmount cleanup: if the wizard closes mid-flow after the agent
  // has been created (step 2's POST), delete it server-side so we don't
  // leave a half-built ghost behind.
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
      .catch(() => {
        // Models endpoint optional; the wizard's default model still works.
      })
  }, [])

  const trimmedName = state.name.trim()
  const trimmedSpecialistName = state.specialistName.trim()

  const template = WIZARD_AGENT_TEMPLATES.find((t) => t.id === state.templateId)
  const knowledgeRequired = template?.knowledgeRequired ?? false

  const knowledgeCanProceed = (() => {
    if (state.knowledgeMode === "skip") return !knowledgeRequired
    if (state.knowledgeMode === "existing") return state.selectedExistingDatasetIds.length > 0
    if (state.knowledgeMode === "upload") return state.uploadedDatasetIds.length > 0
    return false
  })()

  return (
    <Wizard onCancel={onClose} cancelLabel="Cancel" submitLabel="Start chatting">
      <Step
        label="Pick a starting point"
        canProceed={() => state.templateId !== null}
        onBeforeNext={async () => {
          const tpl = WIZARD_AGENT_TEMPLATES.find((t) => t.id === state.templateId)
          if (!tpl) return false
          const specialist = WIZARD_SPECIALIST_TEMPLATES.find(
            (s) => s.id === tpl.suggestedSpecialistId,
          )
          setState((prev) => ({
            ...prev,
            name: tpl.isBlank ? prev.name : (prev.name || tpl.name),
            description: prev.description || tpl.description,
            systemPrompt: tpl.systemPrompt,
            specialistTemplateId: tpl.suggestedSpecialistId,
            specialistName: specialist?.isCustom ? "" : (specialist?.name ?? ""),
            specialistSystemPrompt: specialist?.systemPrompt ?? "",
            selectedMcpIds: [...tpl.suggestedMcpIds],
            knowledgeMode: tpl.knowledgeRequired ? "upload" : prev.knowledgeMode,
            uploadDatasetName: prev.uploadDatasetName || suggestDatasetName(tpl),
          }))
          return true
        }}
      >
        <TemplateStepContent state={state} setState={setState} />
      </Step>

      <Step
        label="Name your agent"
        canProceed={() => trimmedName.length >= 3}
        onBeforeNext={async () => {
          if (state.agentId) return true
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
            toast.error(err instanceof Error ? err.message : "Failed to create agent")
            return false
          }
        }}
      >
        <IdentityStepContent state={state} setState={setState} models={models} />
      </Step>

      <Step
        label="Add a specialist"
        description="A focused subagent the main agent can call on for a specific task."
        canProceed={() =>
          state.specialistTemplateId !== null && trimmedSpecialistName.length >= 3
        }
        onBeforeNext={async () => true}
      >
        <SpecialistStepContent state={state} setState={setState} />
      </Step>

      <Step
        label="Connect tools"
        canProceed={() => true}
        onBeforeNext={async () => {
          if (!state.agentId) {
            toast.error("Agent missing — go back and re-create it")
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
            toast.error(err instanceof Error ? err.message : "Failed to add specialist")
            return false
          }
        }}
      >
        <McpStepContent state={state} setState={setState} />
      </Step>

      <Step
        label="Add knowledge"
        description={template?.knowledgePrompt || "Optional documents the agent should draw from."}
        canProceed={() => knowledgeCanProceed}
        onBeforeNext={async () => {
          if (!state.agentId) {
            toast.error("Agent missing — go back")
            return false
          }

          const datasetIdsToAttach: string[] = []
          if (state.knowledgeMode === "existing") {
            datasetIdsToAttach.push(...state.selectedExistingDatasetIds)
          } else if (state.knowledgeMode === "upload") {
            datasetIdsToAttach.push(...state.uploadedDatasetIds)
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
              toast.error(err instanceof Error ? err.message : "Failed to attach dataset")
              return false
            }
          }

          return true
        }}
      >
        <KnowledgeStepContent state={state} setState={setState} />
      </Step>

      <Step
        label="You're ready"
        onBeforeNext={async () => {
          if (!state.agentId) return false
          completedRef.current = true
          router.push(`/agents/${state.agentId}/chat`)
          markWizardSeen()
          onClose()
          // Navigation already happened — Wizard must not increment past the last step.
          return false
        }}
      >
        <DoneStepContent state={state} onClose={onClose} />
      </Step>
    </Wizard>
  )
}
