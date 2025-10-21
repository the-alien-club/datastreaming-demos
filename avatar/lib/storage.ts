import type { Message, Conversation } from "./types";

const CONVERSATIONS_LIST_KEY = "avatar-conversations-list";
const CONVERSATION_PREFIX = "avatar-conversation-";

function generateId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateTitle(messages: Message[]): string {
  if (messages.length === 0) return "New conversation";
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return "New conversation";
  // Take first 50 chars of first message
  return firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? "..." : "");
}

export function getAllConversations(): Conversation[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(CONVERSATIONS_LIST_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error("Error loading conversations list:", error);
    return [];
  }
}

export function getConversationsByPersona(personaId: string): Conversation[] {
  return getAllConversations()
    .filter((c) => c.personaId === personaId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createConversation(personaId: string): Conversation {
  if (typeof window === "undefined") throw new Error("Cannot create conversation on server");

  const conversation: Conversation = {
    id: generateId(),
    personaId,
    title: "New conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
  };

  const conversations = getAllConversations();
  console.log("[Storage] Creating new conversation. Current count:", conversations.length);
  conversations.push(conversation);
  console.log("[Storage] After push. New count:", conversations.length);
  localStorage.setItem(CONVERSATIONS_LIST_KEY, JSON.stringify(conversations));
  console.log("[Storage] Saved to localStorage. New conversation ID:", conversation.id);

  return conversation;
}

export function getConversationMessages(conversationId: string): Message[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(`${CONVERSATION_PREFIX}${conversationId}`);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error("Error loading conversation messages:", error);
    return [];
  }
}

export function saveConversationMessages(conversationId: string, messages: Message[], personaId: string): void {
  if (typeof window === "undefined") return;

  try {
    // Remove audioUrl from messages before saving (base64 audio is too large for localStorage)
    const messagesToSave = messages.map(({ audioUrl, ...msg }) => msg);

    // Save messages
    localStorage.setItem(`${CONVERSATION_PREFIX}${conversationId}`, JSON.stringify(messagesToSave));

    // Update conversation metadata
    const conversations = getAllConversations();
    const conversation = conversations.find((c) => c.id === conversationId);

    if (conversation) {
      conversation.updatedAt = Date.now();
      conversation.messageCount = messages.length;
      conversation.title = generateTitle(messages);
      localStorage.setItem(CONVERSATIONS_LIST_KEY, JSON.stringify(conversations));
    }
  } catch (error) {
    console.error("Error saving conversation messages:", error);
  }
}

export function deleteConversation(conversationId: string): void {
  if (typeof window === "undefined") return;

  try {
    // Remove messages
    localStorage.removeItem(`${CONVERSATION_PREFIX}${conversationId}`);

    // Remove from conversations list
    const conversations = getAllConversations();
    const filtered = conversations.filter((c) => c.id !== conversationId);
    localStorage.setItem(CONVERSATIONS_LIST_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error deleting conversation:", error);
  }
}

export function clearAllConversations(): void {
  if (typeof window === "undefined") return;

  try {
    const conversations = getAllConversations();
    // Remove all conversation messages
    for (const conv of conversations) {
      localStorage.removeItem(`${CONVERSATION_PREFIX}${conv.id}`);
    }
    // Remove conversations list
    localStorage.removeItem(CONVERSATIONS_LIST_KEY);
  } catch (error) {
    console.error("Error clearing all conversations:", error);
  }
}
