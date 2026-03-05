import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ToolActivity } from "@/lib/job-store";
import { cn } from "@/lib/utils";

interface ToolActivityPanelProps {
  toolActivity: ToolActivity[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
}

/** Pretty-print an MCP tool name */
function formatToolName(name: string): string {
  return name
    .replace(/^mcp__(openaire|viz-tools)__/, '')
    .replace(/^openaire_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export const ToolActivityPanel = ({ toolActivity, metrics }: ToolActivityPanelProps) => {
  const elapsedSeconds = Math.floor(metrics.elapsedMs / 1000);
  const activeCount = toolActivity.filter(t => t.status === 'running').length;
  const completedCount = toolActivity.filter(t => t.status === 'completed').length;

  return (
    <Card className="mb-4">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="secondary">
            {activeCount > 0 ? `${activeCount} running` : `${completedCount} tools used`}
          </Badge>
          <span>{metrics.papersFound} papers</span>
          <span>{elapsedSeconds}s</span>
          <span>{metrics.toolCallCount} calls</span>
        </div>
      </CardHeader>
      {toolActivity.length > 0 && (
        <CardContent className="space-y-1.5 px-4 pb-4">
          {toolActivity.map((activity, idx) => (
            <ToolActivityRow key={`${activity.toolName}-${activity.startedAt}-${idx}`} activity={activity} />
          ))}
        </CardContent>
      )}
    </Card>
  );
};

const ToolActivityRow = ({ activity }: { activity: ToolActivity }) => {
  const duration = activity.completedAt
    ? Math.floor((activity.completedAt - activity.startedAt) / 1000)
    : Math.floor((Date.now() - activity.startedAt) / 1000);

  const statusConfig = {
    running: { icon: '⏳', className: 'text-blue-500 animate-pulse' },
    completed: { icon: '✓', className: 'text-green-600' },
    error: { icon: '✗', className: 'text-red-500' },
  };
  const config = statusConfig[activity.status];

  return (
    <div className={cn("flex items-center gap-2 text-sm", config.className)}>
      <span>{config.icon}</span>
      <span className="font-medium">{formatToolName(activity.toolName)}</span>
      <span className="text-xs text-muted-foreground">{duration}s</span>
    </div>
  );
};
