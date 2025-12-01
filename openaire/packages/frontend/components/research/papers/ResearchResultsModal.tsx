import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResearchPaperCard } from "./ResearchPaperCard";
import type { ResearchProduct } from "@/types/research";

interface ResearchResultsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  papers: ResearchProduct[];
}

export function ResearchResultsModal({
  isOpen,
  onOpenChange,
  papers,
}: ResearchResultsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            All Research Results ({papers.length} papers)
          </DialogTitle>
          <DialogDescription>
            Complete list of research products from OpenAIRE
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-3">
            {papers.map((paper, index) => (
              <ResearchPaperCard
                key={paper.id}
                paper={paper}
                showIndex={index + 1}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
