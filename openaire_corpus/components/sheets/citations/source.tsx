"use client"

// components/sheets/citations/source.tsx
// SheetCitationSource — the "Reference · cited source" side panel opened from a
// citation pill in the research reader/chat. It shows the cited record's
// identifier, the passage locator, external links (DOI / OpenAIRE record), and
// the other notes that cite the same record.

import { useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react"
import { DOI_URL, OPENAIRE_RECORD_URL } from "@/lib/constants"
import { useCitationsForId, type CitationUsage } from "@/hooks/api/citations"
import { parseLocator } from "@/lib/citations/syntax"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface SheetCitationSourceProps {
  projectId: string
  openaireId: string | null
  /** Passage locator token ("p12" | "abstract") or null for a document cite. */
  locator: string | null
  label: string | null
  /** DOI (bare) when known — drives the "Open via DOI" action. */
  doi?: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function SheetCitationSource({
  projectId,
  openaireId,
  locator,
  label,
  doi = null,
  open,
  onOpenChange,
}: SheetCitationSourceProps) {
  const t = useTranslations("citations.panel")
  const { data: usages } = useCitationsForId(projectId, openaireId)

  const parsedLocator = parseLocator(locator)
  const locatorText =
    parsedLocator?.kind === "page"
      ? t("pageLabel", { page: parsedLocator.page })
      : parsedLocator?.kind === "abstract"
        ? t("abstractLabel")
        : null

  // Dedupe by note — a note citing the same record several times returns one
  // usage row per citation, which would otherwise render as N identical lines.
  const otherNotes = useMemo(() => {
    const seen = new Set<string>()
    const out: CitationUsage[] = []
    for (const u of usages ?? []) {
      if (seen.has(u.noteId)) continue
      seen.add(u.noteId)
      out.push(u)
    }
    return out
  }, [usages])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-105 max-w-full flex-col gap-0 overflow-y-auto p-0"
      >
        <SheetHeader className="border-b px-4 py-3">
          <span className="mono-eyebrow text-brand-teal">{t("eyebrow")}</span>
          <SheetTitle className="text-base leading-snug">{label ?? t("title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 py-5">
          {locatorText ? (
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {locatorText}
            </span>
          ) : null}

          {/* DOI box */}
          {doi ? (
            <div className="rounded-md border bg-input/20 px-3 py-2.5">
              <div className="mono-eyebrow mb-1 text-neutral-600">{t("doiLabel")}</div>
              <div className="break-all font-mono text-[11.5px] text-brand-teal">{doi}</div>
            </div>
          ) : null}

          {/* External surfaces */}
          <div>
            <div className="mono-eyebrow mb-2.5 text-neutral-600">{t("consult")}</div>
            <div className="flex flex-col gap-2">
              {doi ? (
                <CiteAction
                  href={DOI_URL(doi)}
                  icon={<ExternalLink className="size-4" strokeWidth={1.8} />}
                  title={t("openDoi")}
                  subtitle={t("openDoiSub")}
                  primary
                />
              ) : null}
              {openaireId ? (
                <CiteAction
                  href={OPENAIRE_RECORD_URL(openaireId, doi)}
                  icon={<BookOpen className="size-4" strokeWidth={1.8} />}
                  title={t("openaireRecord")}
                  subtitle={t("openaireRecordSub")}
                  primary={!doi}
                />
              ) : null}
            </div>
          </div>

          {/* Other notes citing this record */}
          {otherNotes.length > 0 ? (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-sm font-medium">{t("usages")}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {otherNotes.map((u) => (
                    <li key={u.noteId} className="truncate">
                      {u.noteTitle}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// A rich external-link row. `primary` gives the teal-highlighted treatment.
function CiteAction({
  href,
  icon,
  title,
  subtitle,
  primary = false,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
  primary?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
        primary
          ? "border-brand-teal/35 bg-brand-teal/8 hover:bg-brand-teal/15"
          : "hover:border-neutral-600",
      )}
    >
      <span className={cn("shrink-0", primary ? "text-brand-teal" : "text-neutral-300")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-foreground">{title}</span>
        <span className="block text-[10.5px] text-muted-foreground">{subtitle}</span>
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
    </a>
  )
}
