import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/chat-interface";
import { getPersonaById } from "@/lib/personas";

interface ChatPageProps {
  params: Promise<{
    personaId: string;
    conversationId: string;
  }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { personaId, conversationId } = await params;
  const persona = getPersonaById(personaId);

  if (!persona || persona.disabled) {
    notFound();
  }

  return <ChatInterface persona={persona} conversationId={conversationId} />;
}
