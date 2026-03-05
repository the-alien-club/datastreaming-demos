import { useRef, useEffect, useCallback } from "react";
import type { Message } from "@/types/research";

/**
 * Hook to automatically scroll to the bottom of a chat pane
 * when messages or tool activity update.
 */
export function useAutoScroll(
  messages: Message[],
  isLoading: boolean,
  extraDepCount?: number
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Scroll when messages change, loading state changes, or tool activity updates
  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, messages.length, isLoading, extraDepCount, scrollToBottom]);

  return scrollContainerRef;
}
