"use client";

import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  personaName: string;
  personaAvatar?: string;
}

export function MessageList({ messages, personaName, personaAvatar }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const personaInitials = personaName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-muted-foreground mb-2">No messages yet</p>
            <p className="text-sm text-muted-foreground/70">
              Click the mic button above to start your conversation
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-4 ${
              message.role === "user" ? "justify-end" : "justify-start"
            } animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            {message.role === "assistant" && (
              <Avatar className="h-10 w-10 border-2 border-primary/10">
                {personaAvatar && (
                  <AvatarImage src={`/${personaAvatar}`} alt={personaName} />
                )}
                <AvatarFallback className="text-sm bg-primary/5 text-primary font-semibold">
                  {personaInitials}
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className={`rounded-2xl px-5 py-3 max-w-[75%] shadow-sm ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 border border-border/50"
              }`}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs opacity-60 mt-2">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {message.role === "user" && (
              <Avatar className="h-10 w-10 border-2 border-muted">
                <AvatarFallback className="text-sm bg-muted font-semibold">You</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
