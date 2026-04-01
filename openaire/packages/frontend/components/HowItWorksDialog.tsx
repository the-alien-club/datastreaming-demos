"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, Search, Network, Database, BarChart3, BookOpen } from "lucide-react";

function CapabilityCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className="mt-0.5 shrink-0">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function HowItWorksDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5">
          <Info className="h-3.5 w-3.5" />
          How it works
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>How it works</DialogTitle>
          <DialogDescription>
            An AI-powered research assistant connected to 600M+ research products
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Overview */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Overview</h3>
              <p className="text-sm text-muted-foreground">
                This application uses the{" "}
                <span className="font-medium text-foreground">Claude Agent SDK</span>{" "}
                to connect Claude to three specialized MCP (Model Context Protocol) servers.
                When you ask a research question, Claude autonomously selects the right tools,
                queries the research databases, and synthesizes the results.
              </p>
            </section>

            {/* Architecture */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Architecture</h3>
              <div className="rounded-lg border bg-muted/50 p-5 flex flex-col items-center gap-0">
                {/* User */}
                <div className="rounded-md border bg-background px-4 py-2 text-xs font-medium">
                  Your question
                </div>
                <div className="h-4 w-px bg-border" />
                {/* Claude */}
                <div className="rounded-md border-2 border-primary/50 bg-background px-4 py-2 text-xs font-semibold">
                  Claude (Agent SDK)
                </div>
                {/* Branching lines */}
                <div className="h-4 w-px bg-border" />
                <div className="relative w-3/4 h-px bg-border">
                  <div className="absolute left-0 top-0 h-4 w-px bg-border" />
                  <div className="absolute left-1/2 top-0 h-4 w-px bg-border -translate-x-px" />
                  <div className="absolute right-0 top-0 h-4 w-px bg-border" />
                </div>
                <div className="h-4" />
                {/* MCP Servers */}
                <div className="grid grid-cols-3 gap-3 w-full">
                  <div className="flex flex-col items-center gap-1 rounded-md border bg-background p-2">
                    <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400">OpenAIRE</span>
                    <span className="text-[10px] text-muted-foreground">MCP</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-md border bg-background p-2">
                    <span className="text-[10px] font-medium text-green-500 dark:text-green-400">bioRxiv</span>
                    <span className="text-[10px] text-muted-foreground">MCP</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-md border bg-background p-2">
                    <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400">medRxiv</span>
                    <span className="text-[10px] text-muted-foreground">MCP</span>
                  </div>
                </div>
              </div>
            </section>

            {/* MCP Servers */}
            <section>
              <h3 className="text-sm font-semibold mb-2">MCP Servers</h3>
              <div className="space-y-2">
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">OpenAIRE Research Graph</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    600M+ research products — search papers, explore citations, analyze
                    author networks, discover datasets, track research trends, and assess
                    bibliometric impact across all scientific disciplines.
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">bioRxiv Data Cluster</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Biology preprint repository — full-text search, vector similarity,
                    and structured metadata for life sciences preprints.
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">medRxiv Data Cluster</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Health sciences preprint repository — full-text search, vector
                    similarity, and structured metadata for medical research preprints.
                  </p>
                </div>
              </div>
            </section>

            {/* Capabilities */}
            <section>
              <h3 className="text-sm font-semibold mb-2">What you can do</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <CapabilityCard
                  icon={Search}
                  title="Literature Review"
                  description="Survey a field, find key papers, and identify research gaps"
                />
                <CapabilityCard
                  icon={Network}
                  title="Citation Analysis"
                  description="Explore citation networks and co-citation patterns"
                />
                <CapabilityCard
                  icon={BookOpen}
                  title="Author Landscape"
                  description="Map a researcher's work, collaborations, and impact"
                />
                <CapabilityCard
                  icon={Database}
                  title="Dataset Discovery"
                  description="Find research datasets and assess their relevance"
                />
                <CapabilityCard
                  icon={BarChart3}
                  title="Bibliometric Assessment"
                  description="Identify landmark, trending, or high-impact papers"
                />
                <CapabilityCard
                  icon={Search}
                  title="Cross-Domain Discovery"
                  description="Find methods and data from outside your home field"
                />
              </div>
            </section>

            {/* How a query works */}
            <section>
              <h3 className="text-sm font-semibold mb-2">How a query works</h3>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>You type a research question in natural language.</li>
                <li>Claude identifies the intent and selects the appropriate MCP tools.</li>
                <li>
                  Tools are called in parallel when possible — e.g., searching OpenAIRE
                  for papers while querying bioRxiv for preprints.
                </li>
                <li>
                  For large results, Claude delegates to subagents to stay within context limits.
                </li>
                <li>
                  Results are synthesized into a coherent answer with citations and
                  interactive visualizations.
                </li>
              </ol>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
