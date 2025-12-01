import React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ResearchPaperCard } from "../papers/ResearchPaperCard";
import type { MessageComponentProps } from "@/types/research";

export const MessageComponent: React.FC<MessageComponentProps> = ({
  message,
  onShowAllPapers,
}) => {
  return (
    <div className="flex items-start gap-2">
      {message.role === "assistant" && (
        <Avatar className="w-8 h-8 border">
          <AvatarImage src="/ant-logo.svg" alt="OpenAIRE Assistant" />
          <AvatarFallback>OA</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex flex-col max-w-[75%] ${
          message.role === "user" ? "ml-auto" : ""
        }`}
      >
        <div
          className={`p-3 rounded-md text-base ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted border"
          }`}
        >
          {message.content === "thinking" ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2" />
              {message.hasToolUse ? (
                <div className="flex flex-col gap-2">
                  <Badge variant="secondary" className="inline-flex">
                    <Search className="w-4 h-4 mr-1" /> Searching OpenAIRE
                  </Badge>
                  <span>Thinking...</span>
                </div>
              ) : (
                <span>Thinking...</span>
              )}
            </div>
          ) : message.role === "assistant" ? (
            <div className="flex flex-col gap-2">
              {message.hasToolUse && (
                <Badge variant="secondary" className="inline-flex px-0">
                  <Search className="w-4 h-4 mr-1" /> Found Research
                </Badge>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <span>{message.content}</span>
          )}
        </div>

        {/* Display research results inline */}
        {message.researchData && message.researchData.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.researchData.slice(0, 5).map((paper) => (
              <ResearchPaperCard key={paper.id} paper={paper} compact />
            ))}
            {message.researchData.length > 5 && onShowAllPapers && (
              <Button
                variant="link"
                size="sm"
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={() => onShowAllPapers(message.researchData || [])}
              >
                + {message.researchData.length - 5} more results
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
