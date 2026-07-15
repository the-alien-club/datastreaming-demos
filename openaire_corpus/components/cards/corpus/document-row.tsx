"use client"

// components/cards/corpus/document-row.tsx
// Clickable document row for the corpus comprehension list. Horizontal layout
// (title/meta/DOI · lang + type chips · arrow) mirroring the OpenAIRE design
// prototype rows.

import { ArrowRight, Loader2, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { BadgeDocumentType } from "@/components/badges/documents/type-badge"
import { BadgeDocumentLang } from "@/components/badges/documents/lang-badge"
import { cn } from "@/lib/utils"
import { DOCUMENT_RESOLVE_STATUS } from "@/models/documents/schema"
import type { DocumentRow } from "@/models/corpus/schema"

interface Props {
  doc: DocumentRow
  onClick?: () => void
}

export function CardCorpusDocumentRow({ doc, onClick }: Props) {
  const t = useTranslations("corpus.documents")

  const meta = [doc.author, doc.dateLabel ?? doc.year, doc.venue ?? doc.publisher]
    .filter(Boolean)
    .join(" · ")

  const isPending = doc.resolveStatus === DOCUMENT_RESOLVE_STATUS.PENDING
  const isFailed = doc.resolveStatus === DOCUMENT_RESOLVE_STATUS.FAILED
  // Stubs have no title until the background resolver fills it in.
  const titleText = doc.title ?? (isFailed ? t("resolveFailed") : t("resolving"))

  // Prefer the DOI as the mono identifier line; fall back to the OpenAIRE id.
  const identifier = doc.doi ?? doc.openaireId
  // The type-chip shows the finer instance type when known, else the coarse type.
  const typeCode = doc.instanceType ?? doc.docType

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "flex items-center gap-1.5 truncate text-[13px] font-semibold",
            doc.title ? "text-foreground" : "text-muted-foreground italic",
          )}
        >
          {isPending && (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
          {isFailed && (
            <TriangleAlert className="size-3 shrink-0 text-destructive" aria-hidden />
          )}
          <span className="truncate">{titleText}</span>
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
            {meta}
          </span>
        )}
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground/70">
          {identifier}
        </span>
      </span>

      {doc.lang && <BadgeDocumentLang code={doc.lang} />}
      {typeCode && <BadgeDocumentType code={typeCode} />}

      <ArrowRight
        className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-brand-teal"
        aria-hidden
      />
    </button>
  )
}
