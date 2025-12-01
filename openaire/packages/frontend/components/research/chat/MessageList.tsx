import React, { useMemo } from "react";
import { MessageComponent } from "./MessageComponent";
import { ThinkingBlock } from "./ThinkingBlock";
import { AgentActivityPanel } from "../agents/AgentActivityPanel";
import { useAutoScroll } from "@/hooks/research/useAutoScroll";
import type { Message, ResearchProduct } from "@/types/research";
import type { AgentInstance, AgentType, ToolCall } from "@/lib/job-store";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  agentStatus: Record<AgentType, AgentInstance[]> | null;
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

// Group messages to combine consecutive progress messages
function groupMessages(messages: Message[]) {
  const groups: Array<{ type: 'progress' | 'message'; messages: Message[] | string[] }> = [];
  let currentProgressGroup: string[] = [];

  console.log('🔍 Grouping messages:', messages.map(m => ({ type: m.messageType, content: m.content.substring(0, 50) })));

  for (const message of messages) {
    if (message.messageType === 'progress') {
      // Accumulate progress messages
      console.log('➕ Adding to progress group:', message.content.substring(0, 50));
      currentProgressGroup.push(message.content);
    } else {
      // When we hit a non-progress message, flush any accumulated progress
      if (currentProgressGroup.length > 0) {
        console.log('📦 Flushing progress group with', currentProgressGroup.length, 'messages');
        groups.push({ type: 'progress', messages: currentProgressGroup });
        currentProgressGroup = [];
      }
      // Add the non-progress message
      console.log('💬 Adding non-progress message:', message.messageType, message.content.substring(0, 50));
      groups.push({ type: 'message', messages: [message] });
    }
  }

  // Flush any remaining progress messages
  if (currentProgressGroup.length > 0) {
    console.log('📦 Final flush with', currentProgressGroup.length, 'messages');
    groups.push({ type: 'progress', messages: currentProgressGroup });
  }

  console.log('✅ Groups created:', groups.map(g => ({ type: g.type, count: g.messages.length })));
  return groups;
}

export function MessageList({
  messages,
  isLoading,
  agentStatus,
  toolCalls,
  metrics,
  showTimeline,
  onToggleTimeline,
  onShowAllPapers,
}: MessageListProps) {
  const messagesEndRef = useAutoScroll(messages, isLoading);

  // Group consecutive progress messages
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  return (
    <div className="space-y-4 min-h-full">
      {/* Multi-Agent Activity Panel */}
      {isLoading && (
        <AgentActivityPanel
          agentStatus={agentStatus}
          toolCalls={toolCalls}
          metrics={metrics}
          showTimeline={showTimeline}
          onToggleTimeline={onToggleTimeline}
        />
      )}

      {messageGroups.map((group, groupIndex) => {
        // Use stable key for thinking block - find first message ID in the progress group
        const groupKey = group.type === 'progress'
          ? `thinking-block-${groupIndex}`
          : (group.messages[0] as Message).id;

        return (
          <div key={groupKey} className="animate-fade-in-up">
            {group.type === 'progress' ? (
              <ThinkingBlock progressMessages={group.messages as string[]} />
            ) : (
              group.messages.map((message) => (
                <div
                  key={(message as Message).id}
                  className={
                    (message as Message).content === "thinking" ? "animate-pulse" : ""
                  }
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
      <div ref={messagesEndRef} className="h-4" />
    </div>
  );
}
