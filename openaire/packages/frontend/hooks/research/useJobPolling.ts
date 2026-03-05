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
import type { ToolActivity, ToolCall } from "@/lib/job-store";

interface UseJobPollingOptions {
  jobId: string | null;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onToolActivityUpdate: (activity: ToolActivity[]) => void;
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
  onToolActivityUpdate,
  onToolCallsUpdate,
  onMetricsUpdate,
  onComplete,
  onError,
}: UseJobPollingOptions) {
  const lastMessageCountRef = useRef(0);

  // Store callbacks in refs to avoid re-running effect when they change
  const callbacksRef = useRef({
    onMessagesUpdate,
    onToolActivityUpdate,
    onToolCallsUpdate,
    onMetricsUpdate,
    onComplete,
    onError,
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onMessagesUpdate,
      onToolActivityUpdate,
      onToolCallsUpdate,
      onMetricsUpdate,
      onComplete,
      onError,
    };
  });

  useEffect(() => {
    if (!jobId) return;

    console.log(`Starting polling for job: ${jobId}`);
    lastMessageCountRef.current = 0;

    const pollJob = async () => {
      try {
        const job: JobStatus = await getJobStatus(jobId);

        const hasNewMessages = job.messages.length > lastMessageCountRef.current;

        if (hasNewMessages || job.toolActivity || job.toolCalls || job.metrics) {
          console.log(`Update: ${job.status}, messages=${job.messages.length}`);

          if (job.toolActivity) callbacksRef.current.onToolActivityUpdate(job.toolActivity);
          if (job.toolCalls) callbacksRef.current.onToolCallsUpdate(job.toolCalls);
          if (job.metrics) callbacksRef.current.onMetricsUpdate(job.metrics);

          const newMessages = job.messages.slice(lastMessageCountRef.current);
          lastMessageCountRef.current = job.messages.length;

          for (const msg of newMessages) {
            callbacksRef.current.onMessagesUpdate((prevMessages) => processJobMessage(prevMessages, msg));
          }

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

    const pollInterval = createPollingInterval(pollJob, POLLING_CONFIG.INTERVAL_MS);
    const pollTimeout = createPollingTimeout(() => {
      cleanup.stop();
      callbacksRef.current.onComplete();
    }, POLLING_CONFIG.TIMEOUT_MS);

    const cleanup = createPollingCleanup(pollInterval, pollTimeout);

    return () => cleanup.stop();
  }, [jobId]);
}
