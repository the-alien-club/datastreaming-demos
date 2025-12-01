import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ResearchProduct } from "@/types/research";

interface ResearchPaperCardProps {
  paper: ResearchProduct;
  compact?: boolean;
  showIndex?: number;
}

export function ResearchPaperCard({ paper, compact = false, showIndex }: ResearchPaperCardProps) {
  if (compact) {
    return (
      <Card className="p-3 text-sm hover:bg-accent transition-colors cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium line-clamp-2 mb-1">{paper.title}</h4>
            <p className="text-xs text-muted-foreground truncate">
              {paper.authors.slice(0, 3).map((a) => a.name).join(", ")}
              {paper.authors.length > 3 && " et al."}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(paper.publicationDate).getFullYear()}</span>
              {paper.journal && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[150px]">{paper.journal}</span>
                </>
              )}
              {paper.type && (
                <>
                  <span>•</span>
                  <span>{paper.type}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            {paper.openAccess && (
              <Badge variant="outline" className="text-xs">
                {paper.openAccessColor || "OA"}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {paper.type}
            </Badge>
          </div>
        </div>
      </Card>
    );
  }

  // Full card view for modal
  return (
    <Card className="p-4 hover:bg-accent transition-colors">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {showIndex !== undefined && (
                <span className="text-xs font-mono text-muted-foreground">
                  #{showIndex}
                </span>
              )}
              <Badge variant="secondary" className="text-xs">
                {paper.type}
              </Badge>
              {paper.openAccess && (
                <Badge variant="outline" className="text-xs">
                  {paper.openAccessColor || "OA"}
                </Badge>
              )}
            </div>
            <h4 className="font-medium text-sm mb-1">{paper.title}</h4>
            <p className="text-xs text-muted-foreground">
              {paper.authors.slice(0, 5).map((a) => a.name).join(", ")}
              {paper.authors.length > 5 && " et al."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs font-medium">
              {new Date(paper.publicationDate).getFullYear()}
            </span>
          </div>
        </div>

        {paper.journal && (
          <div className="text-xs text-muted-foreground">📖 {paper.journal}</div>
        )}

        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            DOI: {paper.doi}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}

        {paper.subjects && paper.subjects.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {paper.subjects.slice(0, 4).map((subject, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {subject}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
