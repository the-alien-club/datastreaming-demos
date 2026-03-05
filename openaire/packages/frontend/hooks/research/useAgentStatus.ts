import { useState } from "react";
import type { ToolActivity, ToolCall } from "@/lib/job-store";

interface Metrics {
  papersFound: number;
  toolCallCount: number;
  elapsedMs: number;
}

interface UseAgentStatusReturn {
  toolActivity: ToolActivity[];
  toolCalls: ToolCall[];
  metrics: Metrics;
  showTimeline: boolean;
  setToolActivity: (activity: ToolActivity[]) => void;
  setToolCalls: (calls: ToolCall[]) => void;
  setMetrics: (metrics: Metrics) => void;
  setShowTimeline: (show: boolean) => void;
}

/**
 * Hook to manage tool activity, tool calls, and metrics
 */
export function useAgentStatus(): UseAgentStatusReturn {
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    papersFound: 0,
    toolCallCount: 0,
    elapsedMs: 0,
  });
  const [showTimeline, setShowTimeline] = useState(false);

  return {
    toolActivity,
    toolCalls,
    metrics,
    showTimeline,
    setToolActivity,
    setToolCalls,
    setMetrics,
    setShowTimeline,
  };
}
