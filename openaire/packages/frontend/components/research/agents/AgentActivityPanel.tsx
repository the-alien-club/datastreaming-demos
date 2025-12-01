import React from "react";
import { AgentPanel } from "@/components/AgentPanel";
import { ToolTimeline } from "@/components/ToolTimeline";
import type { AgentInstance, AgentType, ToolCall } from "@/lib/job-store";

interface AgentActivityPanelProps {
  agentStatus: Record<AgentType, AgentInstance[]> | null;
  toolCalls: ToolCall[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  showTimeline: boolean;
  onToggleTimeline: () => void;
}

const DEFAULT_AGENT_STATUS: Record<AgentType, AgentInstance[]> = {
  "data-discovery": [],
  "citation-impact": [],
  "network-analysis": [],
  "trends-analysis": [],
  "visualization": []
};

export function AgentActivityPanel({
  agentStatus,
  toolCalls,
  metrics,
  showTimeline,
  onToggleTimeline,
}: AgentActivityPanelProps) {
  return (
    <div className="mb-4">
      <AgentPanel
        agents={agentStatus || DEFAULT_AGENT_STATUS}
        metrics={metrics}
      />
      {toolCalls.length > 0 && (
        <ToolTimeline
          toolCalls={toolCalls}
          isOpen={showTimeline}
          onToggle={onToggleTimeline}
        />
      )}
    </div>
  );
}
