/**
 * In-memory job store for Mode B (Data flow) — Claude SDK queries that run
 * asynchronously and are polled by the frontend.
 *
 * Stripped from openaire's job-store: removed research-specific metrics
 * (papersFound, citationNetworksBuilt, chartsCreated) and the
 * researchData/charts fields on messages.
 */

export interface ToolActivity {
  toolName: string
  toolUseId?: string
  startedAt: number
  completedAt?: number
  status: "running" | "completed" | "error"
  input?: Record<string, unknown>
  outputSnippet?: string
  elapsedSeconds?: number
  subStatus?: string
}

export interface ToolCall {
  timestamp: number
  elapsed: number
  agent: string
  tool: string
  input: { summary: string; params?: unknown }
  output?: { success: boolean; summary: string; count?: number; durationMs?: number }
}

export interface JobProgress {
  jobId: string
  status: "pending" | "running" | "complete" | "error"
  sessionId?: string
  messages: Array<{
    type: "progress" | "complete" | "assistant-text"
    content?: string
    usage?: unknown
    timestamp?: number
  }>
  toolActivity: ToolActivity[]
  toolCalls: ToolCall[]
  metrics: { toolCallCount: number; elapsedMs: number }
  cancelled?: boolean
  error?: string
  createdAt: number
  updatedAt: number
}

class JobStore {
  private jobs = new Map<string, JobProgress>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    if (typeof setInterval === "function") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    }
  }

  create(jobId: string): JobProgress {
    const job: JobProgress = {
      jobId,
      status: "pending",
      messages: [],
      toolActivity: [],
      toolCalls: [],
      metrics: { toolCallCount: 0, elapsedMs: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.jobs.set(jobId, job)
    return job
  }

  get(jobId: string): JobProgress | null {
    return this.jobs.get(jobId) ?? null
  }

  addMessage(jobId: string, message: JobProgress["messages"][number]): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.messages.push(message)
    job.updatedAt = Date.now()
  }

  setStatus(jobId: string, status: JobProgress["status"]): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = status
    job.updatedAt = Date.now()
  }

  setError(jobId: string, error: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = "error"
    job.error = error
    job.updatedAt = Date.now()
  }

  setSessionId(jobId: string, sessionId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.sessionId = sessionId
    job.updatedAt = Date.now()
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.cancelled = true
    job.updatedAt = Date.now()
  }

  isCancelled(jobId: string): boolean {
    return this.jobs.get(jobId)?.cancelled === true
  }

  addToolActivity(jobId: string, activity: ToolActivity): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.toolActivity.push(activity)
    job.updatedAt = Date.now()
  }

  updateToolActivity(
    jobId: string,
    toolName: string,
    updates: Partial<Pick<ToolActivity, "completedAt" | "status" | "outputSnippet">>,
  ): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    const activity = [...job.toolActivity]
      .reverse()
      .find((a) => a.toolName === toolName && a.status === "running")
    if (activity) {
      Object.assign(activity, updates)
      job.updatedAt = Date.now()
    }
  }

  addToolCall(jobId: string, toolCall: ToolCall): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.toolCalls.push(toolCall)
    job.metrics.toolCallCount++
    job.updatedAt = Date.now()
  }

  private cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.updatedAt < oneHourAgo) {
        this.jobs.delete(jobId)
      }
    }
  }
}

const globalForJobStore = globalThis as unknown as { jobStore: JobStore | undefined }
export const jobStore = globalForJobStore.jobStore ?? new JobStore()
globalForJobStore.jobStore = jobStore
