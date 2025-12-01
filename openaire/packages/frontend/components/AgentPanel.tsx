import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentInstance, AgentType } from "@/lib/job-store";
import { cn } from "@/lib/utils";

interface AgentPanelProps {
  agents: Record<AgentType, AgentInstance[]>;
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
}

const AGENT_CONFIG: Record<AgentType, { name: string; icon: string; color: string }> = {
  'data-discovery': { name: 'Data Discovery', icon: '🔍', color: 'blue' },
  'citation-impact': { name: 'Citation Impact', icon: '⭐', color: 'yellow' },
  'network-analysis': { name: 'Network Analysis', icon: '🕸️', color: 'purple' },
  'trends-analysis': { name: 'Trends Analysis', icon: '📈', color: 'green' },
  'visualization': { name: 'Visualization', icon: '📊', color: 'pink' }
};

export const AgentPanel = ({ agents, metrics }: AgentPanelProps) => {
  const elapsedSeconds = Math.floor(metrics.elapsedMs / 1000);

  // Count total agent instances
  const totalInstances = Object.values(agents).reduce((sum, instances) => sum + instances.length, 0);
  const activeInstances = Object.values(agents).flat().filter(i => i.status === 'running' || i.status === 'starting').length;

  return (
    <Card className="mb-4">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="secondary">🤖 {totalInstances} Agent{totalInstances !== 1 ? 's' : ''} {activeInstances > 0 && `(${activeInstances} active)`}</Badge>
          <span>📄 {metrics.papersFound} papers</span>
          <span>⏱️ {elapsedSeconds}s</span>
          <span>🔧 {metrics.toolCallCount} calls</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {(Object.keys(AGENT_CONFIG) as AgentType[]).map(agentType => (
          <AgentRow
            key={agentType}
            agentType={agentType}
            config={AGENT_CONFIG[agentType]}
            instances={agents[agentType] || []}
          />
        ))}
      </CardContent>
    </Card>
  );
};

interface AgentRowProps {
  agentType: AgentType;
  config: { name: string; icon: string; color: string };
  instances: AgentInstance[];
}

const AgentRow = ({ agentType, config, instances }: AgentRowProps) => {
  if (instances.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-50">
        <span className="text-base">{config.icon}</span>
        <span className="font-medium w-32">{config.name}</span>
        <span className="text-xs text-muted-foreground">idle</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-base mt-0.5">{config.icon}</span>
      <span className="font-medium w-32">{config.name}</span>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {instances.map((instance, idx) => (
          <InstanceBadge key={instance.id} instance={instance} index={idx + 1} color={config.color} />
        ))}
      </div>
    </div>
  );
};

const InstanceBadge = ({
  instance,
  index,
  color
}: {
  instance: AgentInstance;
  index: number;
  color: string;
}) => {
  const statusConfig = {
    starting: { label: '⏸', variant: 'outline' as const, className: 'border-gray-400 text-gray-600' },
    running: { label: '⏳', variant: 'default' as const, className: 'bg-blue-500 animate-pulse' },
    completed: { label: '✓', variant: 'secondary' as const, className: 'bg-green-600 text-white' },
    error: { label: '✗', variant: 'destructive' as const, className: '' }
  };

  const config = statusConfig[instance.status];
  const duration = instance.completedAt
    ? Math.floor((instance.completedAt - instance.startedAt) / 1000)
    : Math.floor((Date.now() - instance.startedAt) / 1000);

  return (
    <Badge
      variant={config.variant}
      className={cn("text-xs px-2 py-0.5", config.className)}
      title={`Instance #${index}: ${instance.status} (${duration}s, ${instance.toolCallsComplete} tools)${instance.currentActivity ? '\n' + instance.currentActivity : ''}`}
    >
      {config.label} #{index}
      {instance.status === 'running' && instance.currentActivity && (
        <span className="ml-1 text-[10px] opacity-75">
          {instance.toolCallsComplete}
        </span>
      )}
    </Badge>
  );
};
