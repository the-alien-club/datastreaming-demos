import { useEffect, useRef } from "react";
import { getJobStatus } from "@/lib/api/research-client";
import { processJobMessage } from "@/lib/utils/message-processor";
import {
  createPollingInterval,
  createPollingTimeout,
  createPollingCleanup,
  POLLING_CONFIG,
} from "@/lib/utils/polling-utils";
import type { Message, JobStatus } from "@/types/research";
import type { AgentInstance, AgentType, ToolCall } from "@/lib/job-store";

interface UseJobPollingOptions {
  jobId: string | null;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onAgentStatusUpdate: (status: Record<AgentType, AgentInstance[]>) => void;
  onToolCallsUpdate: (calls: ToolCall[]) => void;
  onMetricsUpdate: (metrics: { papersFound: number; toolCallCount: number; elapsedMs: number }) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

/**
 * Hook to handle job polling and status updates
 */
export function useJobPolling({
  jobId,
  onMessagesUpdate,
  onAgentStatusUpdate,
  onToolCallsUpdate,
  onMetricsUpdate,
  onComplete,
  onError,
}: UseJobPollingOptions) {
  const lastMessageCountRef = useRef(0);

  // Store callbacks in refs to avoid re-running effect when they change
  const callbacksRef = useRef({
    onMessagesUpdate,
    onAgentStatusUpdate,
    onToolCallsUpdate,
    onMetricsUpdate,
    onComplete,
    onError,
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onMessagesUpdate,
      onAgentStatusUpdate,
      onToolCallsUpdate,
      onMetricsUpdate,
      onComplete,
      onError,
    };
  });

  useEffect(() => {
    if (!jobId) return;

    console.log(`🚀 Starting polling for job: ${jobId}`);
    lastMessageCountRef.current = 0;

    const pollJob = async () => {
      try {
        const job: JobStatus = await getJobStatus(jobId);

        // Only update if there are changes
        const hasNewMessages = job.messages.length > lastMessageCountRef.current;

        if (hasNewMessages || job.agents || job.toolCalls || job.metrics) {
          console.log(`📊 Update: ${job.status}, messages=${job.messages.length}`);

          // Update agent status, tool calls, and metrics
          if (job.agents) callbacksRef.current.onAgentStatusUpdate(job.agents);
          if (job.toolCalls) callbacksRef.current.onToolCallsUpdate(job.toolCalls);
          if (job.metrics) callbacksRef.current.onMetricsUpdate(job.metrics);

          // Process new messages
          const newMessages = job.messages.slice(lastMessageCountRef.current);
          lastMessageCountRef.current = job.messages.length;

          for (const msg of newMessages) {
            callbacksRef.current.onMessagesUpdate((prevMessages) => processJobMessage(prevMessages, msg));
          }

          // Check if job is complete or errored
          if (job.status === "complete" || job.status === "error") {
            cleanup.stop();
            callbacksRef.current.onComplete();

            if (job.status === "error") {
              throw new Error(job.error || "Unknown error");
            }
          }
        }
      } catch (error) {
        console.error("Poll error:", error);
        cleanup.stop();
        callbacksRef.current.onError(error as Error);
      }
    };

    // Start polling
    const pollInterval = createPollingInterval(pollJob, POLLING_CONFIG.INTERVAL_MS);
    const pollTimeout = createPollingTimeout(() => {
      cleanup.stop();
      callbacksRef.current.onComplete();
    }, POLLING_CONFIG.TIMEOUT_MS);

    const cleanup = createPollingCleanup(pollInterval, pollTimeout);

    // Cleanup on unmount
    return () => cleanup.stop();
  }, [jobId]); // Only depend on jobId, not the callbacks
}
