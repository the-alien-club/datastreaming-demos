"use client"

// components/sheets/corpus/document-detail.tsx
// Side panel showing full metadata for a selected corpus document, mirroring the
// OpenAIRE design "Record · OpenAIRE" panel: type chip + title/author, a 2-col
// metadata grid, the abstract, the graph-relations counts (cited-by / references
// / related), the DOI box, the external links (Open via DOI / OpenAIRE record /
// Source repository), and a "Remove from corpus" flow with a reason textarea and
// an "ask the agent to find similar cases" checkbox.
//
// Client component: drives Sheet open state, derives external links, owns the
// remove + retry mutations.

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {
  BookOpen,
  ExternalLink,
  FileText,
  Library,
  Loader2,
  RotateCw,
  TriangleAlert,
  Trash2,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { BadgeDocumentType } from "@/components/badges/documents/type-badge"
import { DOI_URL, OPENAIRE_RECORD_URL } from "@/lib/constants"
import { useRemoveFromCorpus, useRetryResolve } from "@/hooks/api/corpus"
import {
  DOCUMENT_RESOLVE_STATUS,
  LANG,
  PRODUCT_TYPE,
  classifyOpenAccess,
} from "@/models/documents/schema"
import type { DocumentRow } from "@/models/corpus/schema"

interface Props {
  doc: DocumentRow | null
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// One label/value pair in the metadata grid.
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono-eyebrow">{label}</span>
      <span className="text-[12.5px] text-foreground">{value}</span>
    </div>
  )
}

// One external-link card.
function LinkCard({
  href,
  icon,
  title,
  subtitle,
  accent = false,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
  accent?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        accent
          ? "flex items-center gap-3 rounded-md border border-brand-teal/35 bg-brand-teal/10 px-3 py-2.5 transition-colors hover:bg-brand-teal/15"
          : "flex items-center gap-3 rounded-md border bg-transparent px-3 py-2.5 transition-colors hover:border-muted-foreground/60"
      }
    >
      <span className={accent ? "text-brand-teal" : "text-muted-foreground"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-foreground">{title}</span>
        <span className="block text-[10.5px] text-muted-foreground">{subtitle}</span>
      </span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
    </a>
  )
}

// One graph-relation count box (cited-by / references / related).
function RelationBox({ label, count }: { label: string; count: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border bg-input/20 px-2 py-2.5">
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {count != null ? count.toLocaleString("en-US") : "—"}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

export function SheetDocumentDetail({ doc, projectId, open, onOpenChange }: Props) {
  const t = useTranslations("corpus.documents")
  const remove = useRemoveFromCorpus(projectId)
  const retry = useRetryResolve(projectId)

  // Remove-with-reason flow state.
  const [removeExpanded, setRemoveExpanded] = useState(false)
  const [removeReason, setRemoveReason] = useState("")
  const [findSimilar, setFindSimilar] = useState(false)

  // Reset the remove flow whenever the selected doc changes.
  const openaireId = doc?.openaireId
  useEffect(() => {
    setRemoveExpanded(false)
    setRemoveReason("")
    setFindSimilar(false)
  }, [openaireId])

  // Auto-retry metadata resolution on first paint of a failed document. Once per
  // id per mount (guard ref); if it fails again the manual "retry" takes over.
  const autoRetried = useRef<Set<string>>(new Set())
  const isFailed = doc?.resolveStatus === DOCUMENT_RESOLVE_STATUS.FAILED
  const retryMutate = retry.mutate
  useEffect(() => {
    if (!open || !openaireId || !isFailed) return
    if (autoRetried.current.has(openaireId)) return
    autoRetried.current.add(openaireId)
    retryMutate({ ids: [openaireId] })
  }, [open, openaireId, isFailed, retryMutate])

  if (!doc) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="mono-eyebrow font-mono text-[10px]">
              {t("detail.eyebrow")}
            </SheetTitle>
            <SheetDescription className="sr-only">{t("detail.eyebrow")}</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  const typeCode = doc.instanceType ?? doc.docType
  const typeLabel = typeCode
    ? (PRODUCT_TYPE[typeCode]?.label ?? typeCode)
    : t("detail.values.unknown")
  const langLabel = doc.lang ? (LANG[doc.lang]?.label ?? doc.lang) : "—"
  const dateLabel = doc.dateLabel ?? (doc.year != null ? String(doc.year) : "—")

  const oaClass = classifyOpenAccess({
    openAccessColor: doc.openAccessColor,
    isGreen: doc.isGreen,
    bestAccessRight: doc.bestAccessRight,
  })
  const oaLabel = oaClass ?? "—"
  const peerLabel =
    doc.peerReviewed === true
      ? t("detail.values.peerReviewed")
      : doc.peerReviewed === false
        ? t("detail.values.notPeerReviewed")
        : "—"

  const isPending = doc.resolveStatus === DOCUMENT_RESOLVE_STATUS.PENDING

  function onRemove() {
    if (!doc) return
    remove.mutate(
      {
        ids: [doc.openaireId],
        reason: removeReason.trim() || "Removed from the corpus via the record panel",
        findSimilar,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  function onRetry() {
    if (!doc) return
    retry.mutate({ ids: [doc.openaireId] })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 font-mono text-[10px] font-normal tracking-wider text-muted-foreground uppercase">
            <FileText className="size-3.5" />
            {t("detail.eyebrow")}
          </SheetTitle>
          <SheetDescription className="sr-only">{doc.title ?? doc.openaireId}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
          {/* Header: type chip + title + author */}
          <div className="min-w-0">
            {typeCode && <BadgeDocumentType code={typeCode} />}
            <h2 className="mt-2 text-[15px] leading-snug font-semibold tracking-tight">
              {doc.title ?? doc.openaireId}
            </h2>
            {doc.author && (
              <p className="mt-1 text-[11.5px] text-muted-foreground">{doc.author}</p>
            )}
          </div>

          {/* Metadata region — loading while resolving, retry on failure, grid once resolved. */}
          {isPending ? (
            <div className="mt-5 flex flex-col items-center gap-2.5 rounded-md border border-dashed bg-input/10 px-4 py-8 text-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-[12.5px] text-muted-foreground">{t("detail.resolvingMeta")}</p>
            </div>
          ) : isFailed ? (
            <div className="mt-5 flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-7 text-center">
              <TriangleAlert className="size-5 text-destructive" />
              <p className="text-[12.5px] text-muted-foreground">{t("detail.metaFailed")}</p>
              <Button variant="outline" size="sm" onClick={onRetry} disabled={retry.isPending}>
                {retry.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCw className="size-3.5" />
                )}
                {t("detail.retry")}
              </Button>
            </div>
          ) : (
            <>
              {/* Metadata grid */}
              <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3.5">
                <Field label={t("detail.fields.type")} value={typeLabel} />
                <Field label={t("detail.fields.date")} value={dateLabel} />
                <Field label={t("detail.fields.venue")} value={doc.venue ?? doc.publisher ?? "—"} />
                <Field label={t("detail.fields.lang")} value={langLabel} />
                <Field label={t("detail.fields.funder")} value={doc.funder ?? "—"} />
                <Field
                  label={t("detail.fields.citations")}
                  value={doc.citationCount != null ? String(doc.citationCount) : "—"}
                />
                <Field label={t("detail.fields.openAccess")} value={oaLabel} />
                <Field label={t("detail.fields.peerReview")} value={peerLabel} />
              </div>

              {/* Abstract */}
              {doc.abstract && (
                <div className="mt-5">
                  <span className="mono-eyebrow">{t("detail.abstract")}</span>
                  <p className="mt-2 border-l-2 pl-3.5 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
                    {doc.abstract}
                  </p>
                </div>
              )}

              {/* Graph relations */}
              {(doc.citedByCount != null ||
                doc.referencesCount != null ||
                doc.relatedCount != null) && (
                <div className="mt-5">
                  <span className="mono-eyebrow">{t("detail.graphRelations")}</span>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <RelationBox label={t("detail.citedBy")} count={doc.citedByCount} />
                    <RelationBox label={t("detail.references")} count={doc.referencesCount} />
                    <RelationBox label={t("detail.related")} count={doc.relatedCount} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* DOI box */}
          {doc.doi && (
            <div className="mt-5 rounded-md border bg-input/20 px-3 py-2.5">
              <span className="mono-eyebrow">{t("detail.doiIdentifier")}</span>
              <p className="mt-1 font-mono text-[11.5px] break-all text-brand-teal select-all">
                {doc.doi}
              </p>
            </div>
          )}

          {/* External links */}
          <div className="mt-5">
            <span className="mono-eyebrow">{t("detail.open")}</span>
            <div className="mt-2.5 flex flex-col gap-2">
              {doc.doi && (
                <LinkCard
                  href={DOI_URL(doc.doi)}
                  accent
                  icon={<ExternalLink className="size-4" />}
                  title={t("detail.openDoi")}
                  subtitle={t("detail.openDoiSub")}
                />
              )}
              <LinkCard
                href={OPENAIRE_RECORD_URL(doc.openaireId, doc.doi)}
                accent={!doc.doi}
                icon={<BookOpen className="size-4" />}
                title={t("detail.openaireRecord")}
                subtitle={t("detail.openaireRecordSub")}
              />
              {doc.sourceRepoUrl && (
                <LinkCard
                  href={doc.sourceRepoUrl}
                  icon={<Library className="size-4" />}
                  title={t("detail.sourceRepo")}
                  subtitle={t("detail.sourceRepoSub")}
                />
              )}
            </div>
          </div>

          {/* Remove from corpus — expands to a reason textarea + find-similar option. */}
          {removeExpanded ? (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
              <label className="mono-eyebrow" htmlFor="remove-reason">
                {t("detail.removeReasonLabel")}
              </label>
              <textarea
                id="remove-reason"
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[12.5px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={t("detail.removeReasonPlaceholder")}
              />
              <label className="mt-2.5 flex items-start gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={findSimilar}
                  onChange={(e) => setFindSimilar(e.target.checked)}
                  className="mt-0.5"
                />
                {t("detail.removeFindSimilar")}
              </label>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive hover:text-destructive"
                  onClick={onRemove}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("detail.removeConfirm")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveExpanded(false)}
                  disabled={remove.isPending}
                >
                  {t("detail.removeCancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="mt-5 w-full text-destructive hover:text-destructive"
              onClick={() => setRemoveExpanded(true)}
            >
              <Trash2 className="size-3.5" />
              {t("detail.remove")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
