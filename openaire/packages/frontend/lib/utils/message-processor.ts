import type { Message, JobMessage } from "@/types/research";

/**
 * Remove all thinking placeholder messages
 */
export function removeThinkingMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.content !== "thinking");
}

/**
 * Insert a progress message before the thinking placeholder
 */
export function insertProgressMessage(
  messages: Message[],
  content: string,
  timestamp?: number
): Message[] {
  const newMessages = [...messages];
  // Search from the end so progress targets the most recent thinking placeholder
  let thinkingIdx = -1;
  for (let i = newMessages.length - 1; i >= 0; i--) {
    if (newMessages[i].content === "thinking") { thinkingIdx = i; break; }
  }

  if (thinkingIdx !== -1) {
    newMessages.splice(thinkingIdx, 0, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: content,
      messageType: "progress",
      timestamp,
    });
  }

  return newMessages;
}

/**
 * Insert a regular assistant message before the thinking placeholder
 */
export function insertAssistantMessage(
  messages: Message[],
  content: string,
  timestamp?: number
): Message[] {
  const newMessages = [...messages];
  let thinkingIdx = -1;
  for (let i = newMessages.length - 1; i >= 0; i--) {
    if (newMessages[i].content === "thinking") { thinkingIdx = i; break; }
  }

  if (thinkingIdx !== -1) {
    newMessages.splice(thinkingIdx, 0, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: content,
      messageType: "complete",
      timestamp,
    });
  }

  return newMessages;
}

/**
 * Create a complete message from job data
 */
export function createCompleteMessage(jobMessage: JobMessage): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: jobMessage.content || "",
    messageType: "complete",
    hasToolUse: !!jobMessage.researchData?.length,
    researchData: jobMessage.researchData,
    charts: jobMessage.charts,
  };
}

/**
 * Process a job message and update messages array
 */
export function processJobMessage(
  messages: Message[],
  jobMessage: JobMessage
): Message[] {
  switch (jobMessage.type) {
    case "progress":
      return insertProgressMessage(messages, jobMessage.content || "", jobMessage.timestamp);

    case "assistant-text":
      return insertAssistantMessage(messages, jobMessage.content || "", jobMessage.timestamp);

    case "papers":
      console.log(`📄 Papers: ${jobMessage.count}`);
      return messages;

    case "complete":
      console.log("✅ COMPLETE!", jobMessage.researchData?.length, "papers");
      const newMessages = removeThinkingMessages(messages);
      newMessages.push(createCompleteMessage(jobMessage));
      return newMessages;

    default:
      return messages;
  }
}
