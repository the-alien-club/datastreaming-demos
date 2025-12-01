// app/research/page.tsx
"use client";

import React, { useState } from "react";
import TopNavBar from "@/components/TopNavBar";
import { ChatSidebar } from "@/components/research/chat/ChatSidebar";
import { VisualizationsPanel } from "@/components/research/visualizations/VisualizationsPanel";
import { ResearchResultsModal } from "@/components/research/papers/ResearchResultsModal";
import { useResearchChat } from "@/hooks/research/useResearchChat";
import type { ResearchProduct } from "@/types/research";

export default function ResearchChat() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPapers, setModalPapers] = useState<ResearchProduct[]>([]);

  const {
    messages,
    input,
    isLoading,
    selectedModel,
    agentStatus,
    toolCalls,
    metrics,
    showTimeline,
    setSelectedModel,
    setShowTimeline,
    setInput,
    handleSubmit,
    handleKeyDown,
    handleInputChange,
  } = useResearchChat();

  const handleShowAllPapers = (papers: ResearchProduct[]) => {
    setModalPapers(papers);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />

      <div className="flex-1 flex bg-background p-4 pt-0 gap-4 h-[calc(100vh-4rem)]">
        {/* Chat Sidebar - Left */}
        <ChatSidebar
          messages={messages}
          input={input}
          isLoading={isLoading}
          selectedModel={selectedModel}
          agentStatus={agentStatus}
          toolCalls={toolCalls}
          metrics={metrics}
          showTimeline={showTimeline}
          onModelChange={setSelectedModel}
          onShowTimeline={setShowTimeline}
          onInputChange={handleInputChange}
          onSetInput={setInput}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
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
