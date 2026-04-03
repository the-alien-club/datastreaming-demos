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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Terminal, Copy, Check } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative rounded-lg border bg-muted/50 p-3 pr-10 font-mono text-xs overflow-x-auto">
      <CopyButton text={children} />
      <pre className="whitespace-pre-wrap break-all">{children}</pre>
    </div>
  );
}

const MCP_CONFIG = `{
  "mcpServers": {
    "openaire": {
      "type": "http",
      "url": "https://openaire.mcp.alien.club/mcp"
    },
    "datacluster-medrxiv": {
      "type": "http",
      "url": "https://medrxiv.mcp.alien.club/mcp"
    },
    "datacluster-biorxiv": {
      "type": "http",
      "url": "https://biorxiv.mcp.alien.club/mcp"
    }
  }
}`;

export default function InstallPluginDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-sm gap-1.5">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Install the plugin</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Install the plugin</DialogTitle>
          <DialogDescription>
            Connect your AI assistant to OpenAIRE, bioRxiv, and medRxiv
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="claude" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="claude" className="flex-1 gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              Claude
            </TabsTrigger>
            <TabsTrigger value="other" className="flex-1 gap-1.5">
              Other
            </TabsTrigger>
          </TabsList>

          {/* Claude tab */}
          <TabsContent value="claude">
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-6 pt-2">
                {/* Step 1: Install marketplace */}
                <section>
                  <h3 className="text-sm font-semibold mb-1">
                    Step 1 — Install the Alien marketplace
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    The marketplace is a GitHub repository that hosts the plugin. Install it
                    with a single command in Claude Code:
                  </p>
                  <CodeBlock>
                    {`claude marketplace add https://github.com/the-alien-club/claude-marketplace`}
                  </CodeBlock>
                  <p className="text-xs text-muted-foreground mt-2">
                    This registers the <span className="font-medium text-foreground">alien</span>{" "}
                    marketplace, which contains research plugins maintained by Alien Intelligence.
                  </p>
                </section>

                {/* Step 2: Install plugin */}
                <section>
                  <h3 className="text-sm font-semibold mb-1">
                    Step 2 — Install the Open Science plugin
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Install the plugin from the marketplace:
                  </p>
                  <CodeBlock>
                    {`claude plugin install alien/openscience`}
                  </CodeBlock>
                  <p className="text-xs text-muted-foreground mt-2">
                    This adds three MCP servers (OpenAIRE, bioRxiv, medRxiv) and the{" "}
                    <span className="font-medium text-foreground">explore-openaire</span>{" "}
                    skill with 9 research scenario guides.
                  </p>
                </section>

                {/* Step 3: Verify */}
                <section>
                  <h3 className="text-sm font-semibold mb-1">
                    Step 3 — Verify installation
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Restart Claude Code, then ask:
                  </p>
                  <CodeBlock>{`What MCP tools do you have access to?`}</CodeBlock>
                  <p className="text-xs text-muted-foreground mt-2">
                    You should see tools from the{" "}
                    <span className="font-medium text-foreground">openaire</span>,{" "}
                    <span className="font-medium text-foreground">datacluster-medrxiv</span>, and{" "}
                    <span className="font-medium text-foreground">datacluster-biorxiv</span>{" "}
                    servers.
                  </p>
                </section>

                {/* What you get */}
                <section>
                  <h3 className="text-sm font-semibold mb-2">What gets installed</h3>
                  <div className="space-y-2 text-xs">
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">3 MCP Servers</p>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground list-disc list-inside">
                        <li>OpenAIRE — 600M+ research products, citations, authors, projects</li>
                        <li>bioRxiv — biology preprint full-text search and vector similarity</li>
                        <li>medRxiv — health sciences preprint full-text search and vector similarity</li>
                      </ul>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">1 Skill with 9 Scenarios</p>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground list-disc list-inside">
                        <li>Literature review, author landscape, project impact</li>
                        <li>Citation analysis, bibliometric assessment</li>
                        <li>Dataset discovery, cross-domain discovery</li>
                        <li>Find primary publication, assess dataset relevance</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Other tab */}
          <TabsContent value="other">
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-6 pt-2">
                <section>
                  <p className="text-xs text-muted-foreground mb-4">
                    If you&apos;re using another MCP-compatible client, add the three servers
                    manually. All servers use HTTP transport — no local installation required.
                  </p>
                </section>

                {/* Full config */}
                <section>
                  <h3 className="text-sm font-semibold mb-1">MCP Configuration</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Add this to your MCP client&apos;s configuration file:
                  </p>
                  <CodeBlock>{MCP_CONFIG}</CodeBlock>
                </section>

                {/* Server details */}
                <section>
                  <h3 className="text-sm font-semibold mb-2">Server Details</h3>
                  <div className="space-y-3">
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">OpenAIRE</p>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          openaire.mcp.alien.club
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Search 600M+ research products, explore citation networks, analyze
                        author profiles, discover datasets, and track research trends.
                        ~28 tools across Graph API v1, v2, ScholeXplorer, and composite analytics.
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">bioRxiv Data Cluster</p>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          biorxiv.mcp.alien.club
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Full-text search and vector similarity over biology preprints.
                        Query by keyword, semantic similarity, or structured metadata filters.
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">medRxiv Data Cluster</p>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          medrxiv.mcp.alien.club
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Full-text search and vector similarity over health sciences preprints.
                        Query by keyword, semantic similarity, or structured metadata filters.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Compatibility note */}
                <section>
                  <h3 className="text-sm font-semibold mb-1">Compatibility</h3>
                  <p className="text-xs text-muted-foreground">
                    These servers implement the{" "}
                    <span className="font-medium text-foreground">
                      Model Context Protocol (MCP)
                    </span>{" "}
                    over HTTP with SSE streaming. They work with any MCP-compatible client
                    that supports the <code className="text-[10px] bg-muted px-1 py-0.5 rounded">http</code>{" "}
                    transport type.
                  </p>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
