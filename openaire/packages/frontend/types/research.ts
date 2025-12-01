// Import existing chart types
import type { ChartData, ChartConfig } from "./chart";
// Re-export chart types for convenience
export type { ChartData, ChartConfig };

// Core research product types
export interface ResearchProduct {
  id: string;
  type: string;
  title: string;
  authors: Array<{ name: string; affiliation?: string }>;
  publicationDate: string;
  citations: number;
  doi?: string;
  url?: string;
  openAccess: boolean;
  openAccessColor?: string;
  abstract?: string;
  subjects?: string[];
  journal?: string;
}

// Chat message types
export interface Message {
  id: string;
  role: string;
  content: string;
  messageType?: 'progress' | 'complete' | 'user' | 'thinking';
  hasToolUse?: boolean;
  researchData?: ResearchProduct[];
  charts?: ChartData[];
}

// Model types
export interface Model {
  id: string;
  name: string;
}

// API Response types
export interface APIResponse {
  content: string;
  hasToolUse: boolean;
  researchData?: ResearchProduct[];
  charts?: ChartData[];
}

// Job status types
export interface JobMessage {
  type: 'progress' | 'papers' | 'complete';
  content?: string;
  count?: number;
  researchData?: ResearchProduct[];
  charts?: ChartData[];
}

export interface JobStatus {
  status: 'pending' | 'running' | 'complete' | 'error';
  messages: JobMessage[];
  agents?: Record<string, any>;
  toolCalls?: any[];
  metrics?: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  error?: string;
}

// Component prop types
export interface MessageComponentProps {
  message: Message;
  onShowAllPapers?: (papers: ResearchProduct[]) => void;
}
