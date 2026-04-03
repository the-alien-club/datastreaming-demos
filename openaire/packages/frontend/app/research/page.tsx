// app/research/page.tsx
"use client";

import React, { useState } from "react";
import TopNavBar from "@/components/TopNavBar";
import { ChatSidebar } from "@/components/research/chat/ChatSidebar";
import { VisualizationsPanel } from "@/components/research/visualizations/VisualizationsPanel";
import { ResearchResultsModal } from "@/components/research/papers/ResearchResultsModal";
import { useResearchChat } from "@/hooks/research/useResearchChat";
import authClient from "@/lib/connectors/auth-client";
import { MessageSquare, ChartLine } from "lucide-react";
import type { ResearchProduct } from "@/types/research";

export default function ResearchChat() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPapers, setModalPapers] = useState<ResearchProduct[]>([]);
  const [mobileTab, setMobileTab] = useState<"chat" | "viz">("chat");
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session;

  const {
    messages,
    input,
    isLoading,
    selectedModel,
    toolActivity,
    toolCalls,
    metrics,
    showTimeline,
    setSelectedModel,
    setShowTimeline,
    setInput,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
    handleStop,
  } = useResearchChat();

  const handleShowAllPapers = (papers: ResearchProduct[]) => {
    setModalPapers(papers);
    setModalOpen(true);
  };

  const charts = messages.flatMap((m) => m.charts || []);
  const hasCharts = charts.length > 0;

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      {/* Tab switcher - visible below xl (1280px) */}
      <div className="flex xl:hidden border-b bg-background px-4 pb-0">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            mobileTab === "chat"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          onClick={() => setMobileTab("viz")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            mobileTab === "viz"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          <ChartLine className="h-4 w-4" />
          Charts
          {hasCharts && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {charts.length}
            </span>
          )}
        </button>
      </div>

      {/* Desktop (>=1280px): side-by-side | Below: tab-switched full-width */}
      <div className="flex-1 flex bg-background p-2 xl:p-4 pt-0 xl:pt-0 gap-0 xl:gap-4 min-h-0">
        {/* Chat Sidebar */}
        <div className={`${mobileTab === "chat" ? "flex" : "hidden"} xl:flex w-full xl:w-1/3 min-h-0`}>
          <ChatSidebar
            messages={messages}
            input={input}
            isLoading={isLoading}
            isAuthenticated={isAuthenticated}
            toolActivity={toolActivity}
            toolCalls={toolCalls}
            metrics={metrics}
            showTimeline={showTimeline}
            onShowTimeline={setShowTimeline}
            onInputChange={handleInputChange}
            onSetInput={setInput}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            onStop={handleStop}
            onShowAllPapers={handleShowAllPapers}
          />
        </div>

        {/* Visualizations Panel */}
        <div className={`${mobileTab === "viz" ? "flex" : "hidden"} xl:flex flex-1 min-h-0`}>
          <VisualizationsPanel messages={messages} />
        </div>
      </div>

      {/* Research Results Modal */}
      <ResearchResultsModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        papers={modalPapers}
      />
    </div>
  );
}
