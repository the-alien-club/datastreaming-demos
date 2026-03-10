import type { Message, JobStatus } from "@/types/research";

export class AuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

interface StartJobRequest {
  messages: Array<{ role: string; content: string }>;
  model: string;
  previousJobId?: string;
}

interface StartJobResponse {
  jobId: string;
}

/**
 * Start a new research job
 * @param messages - Conversation messages
 * @param model - Model to use
 * @param previousJobId - Optional previous job ID to resume session from
 */
export async function startResearchJob(
  messages: Message[],
  model: string,
  previousJobId?: string
): Promise<string> {
  const apiMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const requestBody: StartJobRequest = {
    messages: apiMessages,
    model,
    ...(previousJobId && { previousJobId }),
  };

  const response = await fetch("/api/research-sdk/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    if (response.status === 401) {
      const body = await response.json().catch(() => ({}));
      if (body.error === 'auth_expired') {
        throw new AuthExpiredError(body.message || 'Session expired');
      }
    }
    throw new Error(`Failed to start research job: ${response.status}`);
  }

  const data: StartJobResponse = await response.json();
  return data.jobId;
}

/**
 * Get the current status of a research job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`/api/research-sdk/status/${jobId}`);

  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }

  return response.json();
}

/**
 * Stop a running research job
 */
export async function stopResearchJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/research-sdk/stop/${jobId}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to stop research job: ${response.status}`);
  }
}
