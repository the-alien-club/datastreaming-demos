import React from "react";
import { ArrowRight } from "lucide-react";
import { EXAMPLE_QUERIES } from "@/constants/research-prompts";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface EmptyStateProps {
  onQuerySelect?: (query: string) => void;
}

export function EmptyState({ onQuerySelect }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in-up max-w-[600px] mx-auto gap-4 sm:gap-6 px-4">
      {/* Logos */}
      <div className="flex items-center gap-3 max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${basePath}/wordmark.svg`}
          alt="Alien Intelligence"
          className="invert dark:invert-0 h-8 sm:h-12 w-auto max-w-[45%] object-contain"
        />
        <span className="text-muted-foreground text-base font-light shrink-0">&times;</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${basePath}/openaire-logo.svg`}
          alt="OpenAIRE"
          className="h-8 sm:h-12 w-auto max-w-[45%] object-contain"
        />
      </div>

      {/* Description */}
      <div className="text-center space-y-1.5">
        <p className="text-base md:text-lg font-semibold">Open Science Plugin Demo</p>
        <p className="text-xs md:text-sm text-muted-foreground max-w-md">
          An AI research assistant powered by{" "}
          <a href="http://www.openaire.eu/" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline underline-offset-2 hover:text-primary transition-colors">OpenAIRE</a>,{" "}
          <a href="https://www.biorxiv.org/" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline underline-offset-2 hover:text-primary transition-colors">bioRxiv</a>, and{" "}
          <a href="https://www.medrxiv.org/" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline underline-offset-2 hover:text-primary transition-colors">medRxiv</a>{" "}
          — search 600M+ research products, explore citation networks, and discover datasets across all disciplines.
        </p>
      </div>

      {/* CTA */}
      <div className="p-3 md:p-4 bg-muted rounded-lg w-full">
        <p className="text-xs md:text-sm font-medium mb-2">Try asking:</p>
        <div className="space-y-1 md:space-y-2">
          {EXAMPLE_QUERIES.map((query, index) => (
            <button
              key={index}
              onClick={() => onQuerySelect?.(query)}
              className="w-full text-left text-xs md:text-sm text-muted-foreground hover:text-foreground hover:bg-background/50 p-1.5 md:p-2 rounded-md transition-colors flex items-center justify-between group"
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
