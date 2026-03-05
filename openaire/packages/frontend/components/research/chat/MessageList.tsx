import React, { useMemo } from "react";
import { MessageComponent } from "./MessageComponent";
import { ThinkingBlock } from "./ThinkingBlock";
import type { Message, ResearchProduct } from "@/types/research";
import type { ToolActivity, ToolCall } from "@/lib/job-store";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  toolActivity: ToolActivity[];
  toolCalls: ToolCall[];
  metrics: {
    papersFound: number;
    toolCallCount: number;
    elapsedMs: number;
  };
  showTimeline: boolean;
  onToggleTimeline: () => void;
  onShowAllPapers: (papers: ResearchProduct[]) => void;
}

interface ProgressItem {
  content: string;
  timestamp: number;
}

// Group messages to combine consecutive progress messages
function groupMessages(messages: Message[]) {
  const groups: Array<{ type: 'progress' | 'message'; messages: Message[] | ProgressItem[] }> = [];
  let currentProgressGroup: ProgressItem[] = [];

  for (const message of messages) {
    if (message.messageType === 'progress') {
      currentProgressGroup.push({
        content: message.content,
        timestamp: message.timestamp || 0,
      });
    } else {
      if (currentProgressGroup.length > 0) {
        groups.push({ type: 'progress', messages: currentProgressGroup });
        currentProgressGroup = [];
      }
      groups.push({ type: 'message', messages: [message] });
    }
  }

  if (currentProgressGroup.length > 0) {
    groups.push({ type: 'progress', messages: currentProgressGroup });
  }

  return groups;
}

export function MessageList({
  messages,
  isLoading,
  toolActivity,
  onShowAllPapers,
}: MessageListProps) {
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  return (
    <div className="space-y-4 min-h-full">
      {messageGroups.map((group, groupIndex) => {
        const groupKey = group.type === 'progress'
          ? `thinking-block-${groupIndex}`
          : (group.messages[0] as Message).id;

        return (
          <div key={groupKey} className="animate-fade-in-up">
            {group.type === 'progress' ? (
              <ThinkingBlock
                progressMessages={group.messages as ProgressItem[]}
                toolActivity={toolActivity}
              />
            ) : (
              group.messages.map((message) => (
                <div
                  key={(message as Message).id}
                  className=""
                >
                  <MessageComponent
                    message={message as Message}
                    onShowAllPapers={onShowAllPapers}
                  />
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
