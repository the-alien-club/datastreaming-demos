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

interface ProgressGroup {
  type: 'progress';
  messages: ProgressItem[];
  startTime: number;
  endTime: number;
}

interface MessageGroup {
  type: 'message';
  messages: Message[];
  startTime: number;
  endTime: number;
}

type GroupedItem = ProgressGroup | MessageGroup;

// Group messages to combine consecutive progress messages.
// Tracks time ranges and treats "thinking" placeholder messages as transparent
// so they don't close/break progress groups.
function groupMessages(messages: Message[]): GroupedItem[] {
  const groups: GroupedItem[] = [];
  let currentProgressGroup: ProgressItem[] = [];
  let progressStartTime = 0;
  let progressEndTime = 0;
  // Collect deferred "thinking" placeholders that arrived while building a progress group
  let deferredThinking: ProgressItem[] = [];

  for (const message of messages) {
    if (message.messageType === 'progress') {
      // "thinking" placeholder content is transparent — defer it so it
      // doesn't break (close) the current progress group.
      if (message.content === 'thinking') {
        if (currentProgressGroup.length > 0) {
          // Inside an active progress group: just defer
          deferredThinking.push({
            content: message.content,
            timestamp: message.timestamp || 0,
          });
          continue;
        }
      }

      const ts = message.timestamp || 0;
      if (currentProgressGroup.length === 0) {
        progressStartTime = ts;
      }
      progressEndTime = ts;

      // Flush any deferred thinking messages first
      if (deferredThinking.length > 0) {
        currentProgressGroup.push(...deferredThinking);
        deferredThinking = [];
      }

      currentProgressGroup.push({
        content: message.content,
        timestamp: ts,
      });
    } else {
      // Flush any deferred thinking messages into the progress group
      if (deferredThinking.length > 0 && currentProgressGroup.length > 0) {
        currentProgressGroup.push(...deferredThinking);
        deferredThinking = [];
      }

      if (currentProgressGroup.length > 0) {
        groups.push({
          type: 'progress',
          messages: currentProgressGroup,
          startTime: progressStartTime,
          endTime: progressEndTime,
        });
        currentProgressGroup = [];
      }

      // Flush deferred thinking as its own group if no progress group was active
      if (deferredThinking.length > 0) {
        const first = deferredThinking[0].timestamp;
        const last = deferredThinking[deferredThinking.length - 1].timestamp;
        groups.push({
          type: 'progress',
          messages: deferredThinking,
          startTime: first,
          endTime: last,
        });
        deferredThinking = [];
      }

      const ts = message.timestamp || 0;
      groups.push({ type: 'message', messages: [message], startTime: ts, endTime: ts });
    }
  }

  // Flush trailing deferred thinking
  if (deferredThinking.length > 0 && currentProgressGroup.length > 0) {
    currentProgressGroup.push(...deferredThinking);
  }

  if (currentProgressGroup.length > 0) {
    groups.push({
      type: 'progress',
      messages: currentProgressGroup,
      startTime: progressStartTime,
      endTime: progressEndTime,
    });
  }

  return groups;
}

// Scope tool activities to only those that overlap a given progress group's
// time range, using the *next* group's startTime as the upper bound.
function getToolsForGroup(
  group: GroupedItem,
  groupIndex: number,
  allGroups: GroupedItem[],
  allToolActivity: ToolActivity[],
): ToolActivity[] {
  if (group.type !== 'progress') return [];

  const lowerBound = group.startTime;
  const nextGroup = allGroups[groupIndex + 1];
  const upperBound = nextGroup && nextGroup.startTime > 0 ? nextGroup.startTime : Infinity;

  return allToolActivity.filter(
    (t) => t.startedAt >= lowerBound && t.startedAt < upperBound,
  );
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
                toolActivity={getToolsForGroup(group, groupIndex, messageGroups, toolActivity)}
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
