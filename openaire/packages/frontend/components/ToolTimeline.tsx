import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/lib/job-store";

interface ToolTimelineProps {
  toolCalls: ToolCall[];
  isOpen: boolean;
  onToggle: () => void;
}

export const ToolTimeline = ({ toolCalls, isOpen, onToggle }: ToolTimelineProps) => {
  const recentCalls = toolCalls.slice().reverse().slice(0, 10);

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle} className="border-t pt-2">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full">
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        <span>Tool Activity ({toolCalls.length} calls)</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1 max-h-48 overflow-y-auto">
        {recentCalls.map((call, i) => (
          <ToolCallItem key={`${call.timestamp}-${i}`} call={call} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

const ToolCallItem = ({ call }: { call: ToolCall }) => {
  const secondsAgo = Math.floor((Date.now() - call.timestamp) / 1000);
  const agentIcon = {
    'research-explorer': '🔍',
    'citation-mapper': '🕸️',
    'research-validator': '✓'
  }[call.agent] || '🔧';

  const toolName = call.tool
    .replace('mcp__openaire__', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="text-xs font-mono pl-4 border-l-2 border-muted py-1">
      <div className="flex items-start gap-2 text-muted-foreground">
        <span className="w-12">{secondsAgo}s ago</span>
        <span>{agentIcon}</span>
        <span className="font-medium text-foreground">{toolName}</span>
      </div>
      {call.output && (
        <div className="text-muted-foreground pl-14 mt-0.5">
          └─ {call.output.summary}
        </div>
      )}
    </div>
  );
};
