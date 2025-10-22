export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  audioUrl?: string;
}

export interface Conversation {
  id: string;
  personaId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Persona {
  id: string;
  name: string;
  context: string;
  datasetId: number;
  searchDatasetIds?: number[] | null;
  disabled: boolean;
  avatar?: string;
}

export interface ChatHistory {
  role: "user" | "assistant";
  content: string;
}

export interface BackendRequest {
  input: {
    search_k: number;
    llm_model: "gemini-2.5-flash";
    dataset_id: number;
    max_tokens: number;
    temperature: number;
    voice_model: "eleven_turbo_v2_5" | "eleven_multilingual_v2" | "eleven_flash_v2_5";
    chat_history: ChatHistory[];
    user_message: string;
    persona_context: string;
    search_dataset_ids: number[] | null;
  };
}

export interface BackendResponse {
  output: {
    text: string;
    audio?: string; // base64 or URL
  };
}

export interface JobCreationResponse {
  success: boolean;
  data: {
    id: number;
    slug: string;
    status: string;
    queueName: string;
    flowId: number;
    createdAt: string;
    updatedAt: string;
  };
}
