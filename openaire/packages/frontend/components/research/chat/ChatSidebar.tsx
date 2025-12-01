import React from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { ChatHeader } from "./ChatHeader";
import { EmptyState } from "./EmptyState";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import type { Message, ResearchProduct } from "@/types/research";
import type { AgentInstance, AgentType, ToolCall } from "@/lib/job-store";

interface ChatSidebarProps {
  messages: Message[];
  input: string;
  isLoading: boolean;
  selectedModel: string;
  agentStatus: Record<AgentType, AgentInstance[]> | null;
  toolCalls: ToolCall[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  showTimeline: boolean;
  onModelChange: (model: string) => void;
  onShowTimeline: (show: boolean) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSetInput: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onShowAllPapers: (papers: ResearchProduct[]) => void;
}

export function ChatSidebar({
  messages,
  input,
  isLoading,
  selectedModel,
  agentStatus,
  toolCalls,
  metrics,
  showTimeline,
  onModelChange,
  onShowTimeline,
  onInputChange,
  onSetInput,
  onSubmit,
  onKeyDown,
  onShowAllPapers,
}: ChatSidebarProps) {
  return (
    <Card className="w-1/3 flex flex-col h-full">
      <CardHeader className="py-3 px-4">
        <ChatHeader
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          hasMessages={messages.length > 0}
        />
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState onQuerySelect={onSetInput} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            agentStatus={agentStatus}
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
          disabled={isLoading}
        />
      </CardFooter>
    </Card>
  );
}
