import type { BackendRequest, JobCreationResponse, ChatHistory } from "../types";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3333";
const BACKEND_TOKEN = process.env.BACKEND_API_TOKEN || "";

interface AvatarFlowParams {
  userMessage: string;
  chatHistory: ChatHistory[];
  personaContext: string;
  datasetId: number;
  llmModel?: "gpt-3.5-turbo" | "gpt-4" | "gpt-4o" | "gpt-4o-mini";
  voiceModel?: "eleven_turbo_v2_5" | "eleven_multilingual_v2" | "eleven_flash_v2_5";
  searchDatasetIds?: number[] | null;
  searchK?: number;
  maxTokens?: number;
  temperature?: number;
}

function buildAvatarRequest(params: AvatarFlowParams): BackendRequest {
  return {
    input: {
      search_k: params.searchK ?? 5,
      llm_model: params.llmModel ?? "gpt-4o-mini",
      dataset_id: params.datasetId,
      max_tokens: params.maxTokens ?? 300,
      temperature: params.temperature ?? 0.7,
      voice_model: params.voiceModel ?? "eleven_turbo_v2_5",
      chat_history: params.chatHistory,
      user_message: params.userMessage,
      persona_context: params.personaContext,
      search_dataset_ids: params.searchDatasetIds ?? null,
    },
  };
}

async function callAvatarAPI(request: BackendRequest): Promise<JobCreationResponse> {
  const response = await fetch(`${BACKEND_URL}/flows/83/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BACKEND_TOKEN}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend API error: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function runAvatarFlow(params: AvatarFlowParams): Promise<JobCreationResponse> {
  const request = buildAvatarRequest(params);
  return callAvatarAPI(request);
}
