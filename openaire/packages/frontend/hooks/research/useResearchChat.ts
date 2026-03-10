import { useState, useCallback, useRef } from "react";
import { startResearchJob, stopResearchJob } from "@/lib/api/research-client";
import { useJobPolling } from "./useJobPolling";
import { useAgentStatus } from "./useAgentStatus";
import { toast } from "@/hooks/use-toast";
import type { Message } from "@/types/research";
import { DEFAULT_MODEL } from "@/constants/models";

/**
 * Main hook for managing research chat state and logic
 */
export function useResearchChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const {
    toolActivity,
    toolCalls,
    metrics,
    showTimeline,
    setToolActivity,
    setToolCalls,
    setMetrics,
    setShowTimeline,
  } = useAgentStatus();

  // Handle job polling
  useJobPolling({
    jobId: currentJobId,
    onMessagesUpdate: setMessages,
    onToolActivityUpdate: setToolActivity,
    onToolCallsUpdate: setToolCalls,
    onMetricsUpdate: setMetrics,
    onComplete: () => setIsLoading(false),
    onError: (error) => {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
      console.error("Job error:", error);

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I apologize, but I encountered an error. Please try again.",
        };
        return newMessages;
      });
    },
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleStop = useCallback(async () => {
    if (currentJobId) {
      try {
        await stopResearchJob(currentJobId);
      } catch (error) {
        console.error("Failed to stop job:", error);
      }
    }
    setIsLoading(false);
  }, [currentJobId]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!input.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
        messageType: "user",
      };

      const thinkingMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "thinking",
        messageType: "thinking",
        hasToolUse: true,
      };

      setMessages((prev) => [...prev, userMessage, thinkingMessage]);
      setInput("");
      setIsLoading(true);

      // Reset textarea height after clearing input
      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
      }

      try {
        const jobId = await startResearchJob(
          [...messages, userMessage],
          selectedModel,
          currentJobId || undefined
        );
        console.log(`Job started: ${jobId}${currentJobId ? ` (resuming from ${currentJobId})` : ''}`);
        setCurrentJobId(jobId);
      } catch (error) {
        console.error("Submit Error:", error);
        setIsLoading(false);
        toast({
          title: "Error",
          description: "Failed to start research job. Please try again.",
          variant: "destructive",
        });

        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "I apologize, but I encountered an error. Please try again.",
          };
          return newMessages;
        });
      }
    },
    [input, isLoading, messages, selectedModel, currentJobId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim()) {
          const form = e.currentTarget.form;
          if (form) {
            const submitEvent = new Event("submit", {
              bubbles: true,
              cancelable: true,
            });
            form.dispatchEvent(submitEvent);
          }
        }
      }
    },
    [input]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = event.target;
      textareaRef.current = textarea;
      setInput(textarea.value);
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
    },
    []
  );

  return {
    // State
    messages,
    input,
    isLoading,
    selectedModel,
    toolActivity,
    toolCalls,
    metrics,
    showTimeline,

    // Actions
    setSelectedModel,
    setShowTimeline,
    setInput,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    handleStop,
  };
}
