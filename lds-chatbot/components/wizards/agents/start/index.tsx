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
  // Reflects the in-flight upload kicked off by the wizard's Next button on
  // the knowledge step. Lifted up so the wizard's own Loader2 spinner
  // (driven by `onBeforeNext`'s promise) and the knowledge step body
  // share the same flag — the user always sees one, never two,
  // "uploading" indicators.
  const [uploadInFlight, setUploadInFlight] = useState(false)

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
    if (state.knowledgeMode === "upload") {
      // Either the files are already uploaded, OR there are queued files +
      // a name set — in which case Next will trigger the upload before
      // advancing.
      return (
        state.uploadedDatasetIds.length > 0 ||
        (state.uploadFiles.length > 0 && state.uploadDatasetName.trim().length > 0)
      )
    }
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
          const tpl = WIZARD_AGENT_TEMPLATES.find((t) => t.id === state.templateId)
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
                starterPrompts: tpl?.starterPrompts ?? [],
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
        canProceed={() => knowledgeCanProceed && !uploadInFlight}
        onBeforeNext={async () => {
          if (!state.agentId) {
            toast.error("Agent missing — go back")
            return false
          }

          // Upload mode: if the user queued files but hasn't pushed them
          // yet, do the upload here (formerly behind an inline "Start
          // upload" button). Then fall through to the attach loop with the
          // freshly-created dataset id added in.
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
              toast.error(err instanceof Error ? err.message : "Upload failed")
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
            // Combine the previously-uploaded ids in `state` with whatever
            // we just uploaded in this same Next click — `setState` above
            // hasn't flushed yet so we can't read it back from
            // `state.uploadedDatasetIds`.
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
              toast.error(err instanceof Error ? err.message : "Failed to attach dataset")
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

/**
 * Upload the queued files in the wizard's corpus-upload step. Creates a
 * dataset, then POSTs the files to its entries endpoint. Returns the new
 * dataset id (wrapped in an array so future iterations could add more
 * datasets in one click). Throws on any non-2xx response — the caller
 * surfaces the error via `toast` and short-circuits the wizard's
 * `onBeforeNext`.
 */
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
