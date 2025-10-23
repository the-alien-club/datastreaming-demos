import type { BackendRequest, JobCreationResponse, ChatHistory } from "../types";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3333";
const BACKEND_TOKEN = process.env.BACKEND_API_TOKEN || "";
const BACKEND_AVATAR_FLOW_ID = process.env.BACKEND_AVATAR_FLOW_ID || "53";

interface AvatarFlowParams {
  userMessage: string;
  chatHistory: ChatHistory[];
  personaContext: string;
  datasetId: number;
  llmModel?: "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-2.5-flash-lite" | "gemini-2.0-flash";
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
      llm_model: params.llmModel ?? "gemini-2.5-flash",
      dataset_id: params.datasetId,
      max_tokens: params.maxTokens ?? 2048,
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
  const response = await fetch(`${BACKEND_URL}/flows/${BACKEND_AVATAR_FLOW_ID}/run`, {
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
