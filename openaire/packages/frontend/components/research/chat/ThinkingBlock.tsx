import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";

interface ThinkingBlockProps {
  progressMessages: string[];
}

export function ThinkingBlock({ progressMessages }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasBeenExpandedRef = useRef(false);
  const previousCountRef = useRef(0);

  // Auto-expand when new messages arrive (after the first message)
  useEffect(() => {
    if (progressMessages.length > previousCountRef.current && progressMessages.length > 1) {
      // New message arrived - keep expanded if already expanded, or expand on first update
      if (hasBeenExpandedRef.current || previousCountRef.current === 1) {
        setIsExpanded(true);
        hasBeenExpandedRef.current = true;
      }
    }
    previousCountRef.current = progressMessages.length;
  }, [progressMessages.length]);

  if (progressMessages.length === 0) return null;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    hasBeenExpandedRef.current = true;
  };

  return (
    <div className="flex items-start gap-2">
      <Avatar className="w-8 h-8 border">
        <AvatarImage src="/ant-logo.svg" alt="OpenAIRE Assistant" />
        <AvatarFallback>OA</AvatarFallback>
      </Avatar>
      <div className="flex flex-col max-w-[75%]">
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 p-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="italic">Thinking... ({progressMessages.length} steps)</span>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2">
            {progressMessages.map((content, index) => (
              <div
                key={index}
                className="p-3 rounded-md text-sm bg-muted/50 border border-muted"
              >
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
