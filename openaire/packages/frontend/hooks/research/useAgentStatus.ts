import { useState } from "react";
import type { AgentInstance, AgentType, ToolCall } from "@/lib/job-store";

interface Metrics {
  papersFound: number;
  toolCallCount: number;
  elapsedMs: number;
}

interface UseAgentStatusReturn {
  agentStatus: Record<AgentType, AgentInstance[]> | null;
  toolCalls: ToolCall[];
  metrics: Metrics;
  showTimeline: boolean;
  setAgentStatus: (status: Record<AgentType, AgentInstance[]> | null) => void;
  setToolCalls: (calls: ToolCall[]) => void;
  setMetrics: (metrics: Metrics) => void;
  setShowTimeline: (show: boolean) => void;
}

/**
 * Hook to manage agent status, tool calls, and metrics
 */
export function useAgentStatus(): UseAgentStatusReturn {
  const [agentStatus, setAgentStatus] = useState<Record<AgentType, AgentInstance[]> | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    papersFound: 0,
    toolCallCount: 0,
    elapsedMs: 0,
  });
  const [showTimeline, setShowTimeline] = useState(false);

  return {
    agentStatus,
    toolCalls,
    metrics,
    showTimeline,
    setAgentStatus,
    setToolCalls,
    setMetrics,
    setShowTimeline,
  };
}
