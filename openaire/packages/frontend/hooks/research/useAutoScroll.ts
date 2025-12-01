import { useRef, useEffect } from "react";
import type { Message } from "@/types/research";

/**
 * Hook to automatically scroll to the bottom when messages update
 */
export function useAutoScroll(messages: Message[], isLoading: boolean) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToBottom = () => {
      if (!messagesEndRef.current) return;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    };

    const timeoutId = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]);

  return messagesEndRef;
}
