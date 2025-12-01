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
  content: string
): Message[] {
  const newMessages = [...messages];
  const thinkingIdx = newMessages.findIndex((m) => m.content === "thinking");

  if (thinkingIdx !== -1) {
    newMessages.splice(thinkingIdx, 0, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: content,
      messageType: "progress",
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
      return insertProgressMessage(messages, jobMessage.content || "");

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
