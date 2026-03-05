// In-memory job store for long-running SDK queries

export interface ToolActivity {
  toolName: string;
  toolUseId?: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'error';
  input?: Record<string, any>;
  outputSnippet?: string;
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
  sessionId?: string;
  messages: Array<{
    type: 'progress' | 'papers' | 'complete';
    content?: string;
    count?: number;
    researchData?: any[];
    charts?: any[];
    usage?: any;
    timestamp?: number;
  }>;

  toolActivity: ToolActivity[];
  toolCalls: ToolCall[];

  metrics: {
    papersFound: number;
    citationNetworksBuilt: number;
    chartsCreated: number;
    toolCallCount: number;
    elapsedMs: number;
  };

  error?: string;
  createdAt: number;
  updatedAt: number;
}

class JobStore {
  private jobs = new Map<string, JobProgress>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  create(jobId: string): JobProgress {
    const job: JobProgress = {
      jobId,
      status: 'pending',
      messages: [],
      toolActivity: [],
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

  setSessionId(jobId: string, sessionId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.sessionId = sessionId;
      job.updatedAt = Date.now();
    }
  }

  getSessionId(jobId: string): string | null {
    const job = this.jobs.get(jobId);
    return job?.sessionId || null;
  }

  // Tool activity tracking
  addToolActivity(jobId: string, activity: ToolActivity): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.toolActivity.push(activity);
      job.updatedAt = Date.now();
    }
  }

  updateToolActivity(jobId: string, toolName: string, updates: Partial<Pick<ToolActivity, 'completedAt' | 'status' | 'outputSnippet'>>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Find the most recent running instance of this tool
    const activity = [...job.toolActivity].reverse().find(a => a.toolName === toolName && a.status === 'running');
    if (activity) {
      Object.assign(activity, updates);
      job.updatedAt = Date.now();
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
