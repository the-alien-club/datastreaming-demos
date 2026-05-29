import { DEFAULT_AGENT_MODEL } from "./templates"

export type KnowledgeMode = "existing" | "upload"

export interface WizardState {
  templateId: string | null

  name: string
  description: string
  systemPrompt: string
  model: string
  agentId: string | null

  specialistTemplateId: string | null
  specialistName: string
  specialistSystemPrompt: string
  specialistModel: string

  selectedMcpIds: string[]
  specialistSubagentId: string | null

  knowledgeMode: KnowledgeMode
  selectedExistingDatasetIds: string[]
  uploadDatasetName: string
  uploadFiles: File[]
  uploadedDatasetIds: string[]
  attachedDatasetIds: string[]
}

export function createInitialState(): WizardState {
  return {
    templateId: null,

    name: "",
    description: "",
    systemPrompt: "",
    model: DEFAULT_AGENT_MODEL,
    agentId: null,

    specialistTemplateId: null,
    specialistName: "",
    specialistSystemPrompt: "",
    specialistModel: DEFAULT_AGENT_MODEL,

    selectedMcpIds: [],
    specialistSubagentId: null,

    knowledgeMode: "existing",
    selectedExistingDatasetIds: [],
    uploadDatasetName: "",
    uploadFiles: [],
    uploadedDatasetIds: [],
    attachedDatasetIds: [],
  }
}

export type WizardSetState = React.Dispatch<React.SetStateAction<WizardState>>
