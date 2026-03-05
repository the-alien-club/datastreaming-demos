import React from "react";
import { ToolActivityPanel } from "@/components/ToolActivityPanel";
import { ToolTimeline } from "@/components/ToolTimeline";
import type { ToolActivity, ToolCall } from "@/lib/job-store";

interface AgentActivityPanelProps {
  toolActivity: ToolActivity[];
  toolCalls: ToolCall[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  showTimeline: boolean;
  onToggleTimeline: () => void;
}

export function AgentActivityPanel({
  toolActivity,
  toolCalls,
  metrics,
  showTimeline,
  onToggleTimeline,
}: AgentActivityPanelProps) {
  return (
    <div className="mb-4">
      <ToolActivityPanel
        toolActivity={toolActivity}
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
