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
              <div className="rounded-lg border bg-muted/50 p-4 text-xs font-mono space-y-1">
                <p className="text-muted-foreground">{"  "}You ask a question</p>
                <p>{"      "}|</p>
                <p>{"      "}v</p>
                <p className="text-foreground">{"  "}Claude (Agent SDK)</p>
                <p>{"      "}|</p>
                <p>{"   "}+--+--+</p>
                <p>{"   "}|{"     "}|{"     "}|</p>
                <p>{"   "}v{"     "}v{"     "}v</p>
                <p>
                  <span className="text-blue-500 dark:text-blue-400">OpenAIRE</span>
                  {"  "}
                  <span className="text-green-500 dark:text-green-400">bioRxiv</span>
                  {"  "}
                  <span className="text-orange-500 dark:text-orange-400">medRxiv</span>
                </p>
                <p className="text-muted-foreground">{"  "}MCP{"      "}MCP{"      "}MCP</p>
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
