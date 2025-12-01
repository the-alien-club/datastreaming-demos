import type { Message, JobStatus } from "@/types/research";
import { withBasePath } from "@/lib/basePath";

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

  const response = await fetch(withBasePath("/api/research-sdk/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Failed to start research job: ${response.status}`);
  }

  const data: StartJobResponse = await response.json();
  return data.jobId;
}

/**
 * Get the current status of a research job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(withBasePath(`/api/research-sdk/status/${jobId}`));

  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }

  return response.json();
}
