// app/research/page.tsx
"use client";

import React, { useState } from "react";
import TopNavBar from "@/components/TopNavBar";
import { ChatSidebar } from "@/components/research/chat/ChatSidebar";
import { VisualizationsPanel } from "@/components/research/visualizations/VisualizationsPanel";
import { ResearchResultsModal } from "@/components/research/papers/ResearchResultsModal";
import { useResearchChat } from "@/hooks/research/useResearchChat";
import authClient from "@/lib/connectors/auth-client";
import type { ResearchProduct } from "@/types/research";

export default function ResearchChat() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPapers, setModalPapers] = useState<ResearchProduct[]>([]);
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

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      <div className="flex-1 flex bg-background p-4 pt-0 gap-4 min-h-0">
        {/* Chat Sidebar - Left */}
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

        {/* Visualizations Panel - Right */}
        <VisualizationsPanel messages={messages} />
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
