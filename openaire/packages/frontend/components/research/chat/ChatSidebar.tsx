import React from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { ChatHeader } from "./ChatHeader";
import { EmptyState } from "./EmptyState";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useAutoScroll } from "@/hooks/research/useAutoScroll";
import type { Message, ResearchProduct } from "@/types/research";
import type { ToolActivity, ToolCall } from "@/lib/job-store";

interface ChatSidebarProps {
  messages: Message[];
  input: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  toolActivity: ToolActivity[];
  toolCalls: ToolCall[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  showTimeline: boolean;
  onShowTimeline: (show: boolean) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSetInput: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
  onShowAllPapers: (papers: ResearchProduct[]) => void;
}

export function ChatSidebar({
  messages,
  input,
  isLoading,
  isAuthenticated,
  toolActivity,
  toolCalls,
  metrics,
  showTimeline,
  onShowTimeline,
  onInputChange,
  onSetInput,
  onSubmit,
  onKeyDown,
  onStop,
  onShowAllPapers,
}: ChatSidebarProps) {
  const scrollRef = useAutoScroll(messages, isLoading, toolActivity.length);

  return (
    <Card className="w-full flex flex-col h-full">
      <CardHeader className="py-3 px-4">
        <ChatHeader />
      </CardHeader>

      <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 scrollbar-hover">
        {messages.length === 0 ? (
          <EmptyState onQuerySelect={onSetInput} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolActivity={toolActivity}
            toolCalls={toolCalls}
            metrics={metrics}
            showTimeline={showTimeline}
            onToggleTimeline={() => onShowTimeline(!showTimeline)}
            onShowAllPapers={onShowAllPapers}
          />
        )}
      </CardContent>

      <CardFooter className="p-4 border-t">
        <ChatInput
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onKeyDown={onKeyDown}
          isLoading={isLoading}
          onStop={onStop}
          disabled={isLoading || !isAuthenticated}
          placeholder={isAuthenticated ? undefined : "Sign in to start researching..."}
        />
      </CardFooter>
    </Card>
  );
}
