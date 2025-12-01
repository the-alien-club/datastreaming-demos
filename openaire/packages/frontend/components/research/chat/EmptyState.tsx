import React from "react";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Network, BookOpen, ArrowRight } from "lucide-react";
import { WELCOME_TEXT, AGENT_FEATURES, EXAMPLE_QUERIES } from "@/constants/research-prompts";
import { withBasePath } from "@/lib/basePath";

interface EmptyStateProps {
  onQuerySelect?: (query: string) => void;
}

export function EmptyState({ onQuerySelect }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in-up max-w-[600px] mx-auto">
      <Avatar className="w-12 h-12 mb-4 border">
        <AvatarImage src={withBasePath("/ant-logo.svg")} alt="OpenAIRE Assistant" className="brightness-0 invert" />
      </Avatar>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-2xl font-semibold">{WELCOME_TEXT.title}</h2>
        <Badge variant="secondary" className="text-xs">
          {WELCOME_TEXT.badge}
        </Badge>
      </div>
      <p className="text-muted-foreground text-center mb-6">
        {WELCOME_TEXT.subtitle}
      </p>
      <div className="space-y-4 text-base w-full">
        {AGENT_FEATURES.map((feature, index) => {
          const IconComponent =
            feature.icon === "search"
              ? Search
              : feature.icon === "network"
              ? Network
              : BookOpen;
          return (
            <div key={index} className="flex items-start gap-3">
              <IconComponent className="text-primary w-6 h-6 mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium">{feature.title}</p>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg w-full">
        <p className="text-sm font-medium mb-2">Try asking:</p>
        <div className="space-y-2">
          {EXAMPLE_QUERIES.map((query, index) => (
            <button
              key={index}
              onClick={() => onQuerySelect?.(query)}
              className="w-full text-left text-sm text-muted-foreground hover:text-foreground hover:bg-background/50 p-2 rounded-md transition-colors flex items-center justify-between group"
            >
              <span>&quot;{query}&quot;</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
