import React from "react";
import { ArrowRight } from "lucide-react";
import { EXAMPLE_QUERIES } from "@/constants/research-prompts";

interface EmptyStateProps {
  onQuerySelect?: (query: string) => void;
}

export function EmptyState({ onQuerySelect }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in-up max-w-[600px] mx-auto">
      <p className="text-lg font-semibold text-center mb-6">
        Search 600M+ research products across all disciplines
      </p>

      <div className="p-4 bg-muted rounded-lg w-full">
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
