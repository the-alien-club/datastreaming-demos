// In-memory job store for long-running SDK queries
// Will upgrade to Redis later for production

export type AgentType = 'data-discovery' | 'citation-impact' | 'network-analysis' | 'trends-analysis' | 'visualization';
export type AgentInstanceStatus = 'starting' | 'running' | 'completed' | 'error';

export interface AgentInstance {
  id: string; // Unique ID for this agent instance
  status: AgentInstanceStatus;
  startedAt: number;
  completedAt?: number;
  toolCallsComplete: number;
  currentActivity?: string;
  error?: string;
}

// Legacy backward compatibility type for existing UI components
export interface AgentStatus {
  status: 'waiting' | 'active' | 'complete';
  startedAt?: number;
  completedAt?: number;
  toolCallsComplete: number;
  toolCallsTotal: number;
  currentActivity?: string;
}

export interface ToolCall {
  timestamp: number;
  elapsed: number;
  agent: string;
  tool: string;
  input: {
    summary: string;
    params?: any;
  };
  output?: {
    success: boolean;
    summary: string;
    count?: number;
    durationMs?: number;
  };
}

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  messages: Array<{
    type: 'progress' | 'papers' | 'complete';
    content?: string;
    count?: number;
    researchData?: any[];
    charts?: any[];
    usage?: any;
  }>;

  // Enhanced tracking - arrays of agent instances per type
  agents: {
    [K in AgentType]: AgentInstance[];
  };

  toolCalls: ToolCall[];

  metrics: {
    papersFound: number;
    citationNetworksBuilt: number;
    chartsCreated: number;
    toolCallCount: number;
    elapsedMs: number;
    currentAgent?: string;
  };

  error?: string;
  createdAt: number;
  updatedAt: number;
}

class JobStore {
  private jobs = new Map<string, JobProgress>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up old jobs every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  create(jobId: string): JobProgress {
    const job: JobProgress = {
      jobId,
      status: 'pending',
      messages: [],
      agents: {
        'data-discovery': [],
        'citation-impact': [],
        'network-analysis': [],
        'trends-analysis': [],
        'visualization': []
      },
      toolCalls: [],
      metrics: {
        papersFound: 0,
        citationNetworksBuilt: 0,
        chartsCreated: 0,
        toolCallCount: 0,
        elapsedMs: 0
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  get(jobId: string): JobProgress | null {
    return this.jobs.get(jobId) || null;
  }

  addMessage(jobId: string, message: JobProgress['messages'][0]): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.messages.push(message);
      job.updatedAt = Date.now();
    }
  }

  setStatus(jobId: string, status: JobProgress['status']): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = Date.now();
    }
  }

  setError(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = error;
      job.updatedAt = Date.now();
    }
  }

  // Agent instance management - NEW APPROACH

  /**
   * Start a new agent instance
   * Returns the instance ID
   */
  startAgentInstance(jobId: string, agentType: AgentType, activity?: string): string {
    const job = this.jobs.get(jobId);
    if (!job) return '';

    const instanceId = `${agentType}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const instance: AgentInstance = {
      id: instanceId,
      status: 'starting',
      startedAt: Date.now(),
      toolCallsComplete: 0,
      currentActivity: activity
    };

    job.agents[agentType].push(instance);
    job.metrics.currentAgent = agentType;
    job.updatedAt = Date.now();

    console.log(`[${jobId}] Started ${agentType} instance: ${instanceId}`);
    return instanceId;
  }

  /**
   * Update an agent instance status
   */
  updateAgentInstance(
    jobId: string,
    agentType: AgentType,
    instanceId: string,
    updates: Partial<Pick<AgentInstance, 'status' | 'currentActivity' | 'completedAt' | 'error'>>
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const instance = job.agents[agentType].find(a => a.id === instanceId);
    if (!instance) {
      console.warn(`[${jobId}] Agent instance not found: ${agentType}/${instanceId}`);
      return;
    }

    Object.assign(instance, updates);

    if (updates.status === 'completed' && !instance.completedAt) {
      instance.completedAt = Date.now();
    }

    job.updatedAt = Date.now();
  }

  /**
   * Increment tool call count for an agent instance
   */
  incrementAgentInstanceProgress(jobId: string, agentType: AgentType, instanceId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const instance = job.agents[agentType].find(a => a.id === instanceId);
    if (instance) {
      instance.toolCallsComplete++;
      job.updatedAt = Date.now();
    }
  }

  /**
   * Get agent statistics for a job
   */
  getAgentStats(jobId: string): Record<AgentType, {
    total: number;
    starting: number;
    running: number;
    completed: number;
    error: number;
  }> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return {
        'data-discovery': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
        'citation-impact': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
        'network-analysis': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
        'trends-analysis': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
        'visualization': { total: 0, starting: 0, running: 0, completed: 0, error: 0 }
      };
    }

    const stats: Record<AgentType, any> = {
      'data-discovery': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
      'citation-impact': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
      'network-analysis': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
      'trends-analysis': { total: 0, starting: 0, running: 0, completed: 0, error: 0 },
      'visualization': { total: 0, starting: 0, running: 0, completed: 0, error: 0 }
    };

    (Object.keys(job.agents) as AgentType[]).forEach(agentType => {
      const instances = job.agents[agentType];
      stats[agentType].total = instances.length;
      instances.forEach(instance => {
        stats[agentType][instance.status]++;
      });
    });

    return stats;
  }

  /**
   * Legacy compatibility - set agent status (creates/updates first instance)
   */
  setAgentStatus(jobId: string, agentType: AgentType, status: 'waiting' | 'active' | 'complete'): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Map legacy statuses to new ones
    const newStatus: AgentInstanceStatus =
      status === 'waiting' ? 'starting' :
      status === 'active' ? 'running' :
      'completed';

    // Get or create first instance
    let instance = job.agents[agentType][0];
    if (!instance) {
      const instanceId = this.startAgentInstance(jobId, agentType);
      instance = job.agents[agentType][0];
    }

    if (instance) {
      this.updateAgentInstance(jobId, agentType, instance.id, { status: newStatus });
    }
  }

  /**
   * Legacy compatibility - set agent activity
   */
  setAgentActivity(jobId: string, agentType: AgentType, activity: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    let instance = job.agents[agentType][0];
    if (!instance) {
      this.startAgentInstance(jobId, agentType, activity);
    } else {
      this.updateAgentInstance(jobId, agentType, instance.id, { currentActivity: activity });
    }
  }

  /**
   * Legacy compatibility - increment agent progress
   */
  incrementAgentProgress(jobId: string, agentType: AgentType): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const instance = job.agents[agentType][0];
    if (instance) {
      this.incrementAgentInstanceProgress(jobId, agentType, instance.id);
    }
  }

  // Tool call logging
  addToolCall(jobId: string, toolCall: ToolCall): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.toolCalls.push(toolCall);
      job.metrics.toolCallCount++;
      job.updatedAt = Date.now();
    }
  }

  // Metrics
  updateMetric(jobId: string, metric: keyof JobProgress['metrics'], value: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      (job.metrics as any)[metric] = value;
      job.updatedAt = Date.now();
    }
  }

  private cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    Array.from(this.jobs.entries()).forEach(([jobId, job]) => {
      if (job.updatedAt < oneHourAgo) {
        console.log(`Cleaning up old job: ${jobId}`);
        this.jobs.delete(jobId);
      }
    });
  }

  getStats(): { total: number; pending: number; running: number; complete: number; error: number } {
    const stats = { total: this.jobs.size, pending: 0, running: 0, complete: 0, error: 0 };
    Array.from(this.jobs.values()).forEach((job) => {
      if (job.status === 'pending') stats.pending++;
      else if (job.status === 'running') stats.running++;
      else if (job.status === 'complete') stats.complete++;
      else if (job.status === 'error') stats.error++;
    });
    return stats;
  }
}

// Global singleton that persists across Next.js API route instances
const globalForJobStore = globalThis as unknown as {
  jobStore: JobStore | undefined;
};

export const jobStore = globalForJobStore.jobStore ?? new JobStore();
globalForJobStore.jobStore = jobStore;
