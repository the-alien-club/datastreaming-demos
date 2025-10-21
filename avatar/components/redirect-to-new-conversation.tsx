"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createConversation, getConversationsByPersona } from "@/lib/storage";

interface RedirectToNewConversationProps {
  personaId: string;
}

export function RedirectToNewConversation({ personaId }: RedirectToNewConversationProps) {
  const router = useRouter();

  useEffect(() => {
    // Check if there are existing conversations
    const existingConversations = getConversationsByPersona(personaId);

    if (existingConversations.length > 0) {
      // Redirect to most recent conversation
      router.replace(`/chat/${personaId}/${existingConversations[0].id}`);
    } else {
      // Create new conversation
      const newConv = createConversation(personaId);
      router.replace(`/chat/${personaId}/${newConv.id}`);
    }
  }, [personaId, router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Loading conversation...</p>
    </div>
  );
}
