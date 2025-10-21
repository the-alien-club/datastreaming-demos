import { notFound } from "next/navigation";
import { getPersonaById } from "@/lib/personas";
import { RedirectToNewConversation } from "@/components/redirect-to-new-conversation";

interface ChatPageProps {
  params: Promise<{
    personaId: string;
  }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { personaId } = await params;
  const persona = getPersonaById(personaId);

  if (!persona || persona.disabled) {
    notFound();
  }

  // Redirect to create a new conversation (client-side)
  return <RedirectToNewConversation personaId={personaId} />;
}
