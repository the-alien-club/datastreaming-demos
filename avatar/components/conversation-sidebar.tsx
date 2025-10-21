"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ConversationSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" title="Conversations">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[320px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-0 flex-1 overflow-hidden">
          <div className="px-6 py-4 border-b">
            <Button onClick={onNewConversation} className="w-full" size="default">
              <Plus className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {conversations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No conversations yet
                </p>
              )}
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors w-72 ${currentConversationId === conversation.id
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted/50 hover:border-border"
                    }`}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <h4 className="text-sm font-medium truncate mb-1">
                      {conversation.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {conversation.messageCount} msg{conversation.messageCount !== 1 ? "s" : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(conversation.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this conversation?")) {
                        onDeleteConversation(conversation.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
