"use client"

// components/cards/research/sources-evidence.tsx
// The "Sources & evidence" panel under a research answer: the ranked passages a
// rag_query returned, so the researcher can see exactly what the answer rests on.
// Driven by the rag_query tool result (RagQueryResponse) in the chat stream.
// Read-only + collapsible; "open record" is an external link to the OpenAIRE
// record (or doi.org), derived from each passage's ids — no app callback needed.

import { useState } from "react"
import { ChevronDown, Eye } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { citationLinks } from "@/lib/citations/external"

/** One passage as returned by rag_query (see lib/cluster/rag.ts RagPassage). */
interface EvidencePassage {
  openaireId: string
  doi: string | null
  locator: string | null
  snippet: string
  score: number
  title?: string
  year?: number
}

/** Safely pull the passages out of an rag_query tool result envelope. */
function extractPassages(result: unknown): EvidencePassage[] {
  if (!result || typeof result !== "object") return []
  const raw = (result as { passages?: unknown }).passages
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .filter((p) => typeof p.openaireId === "string" && typeof p.snippet === "string")
    .map((p) => ({
      openaireId: p.openaireId as string,
      doi: typeof p.doi === "string" ? p.doi : null,
      locator: typeof p.locator === "string" ? p.locator : null,
      snippet: p.snippet as string,
      score: typeof p.score === "number" ? p.score : 0,
      title: typeof p.title === "string" ? p.title : undefined,
      year: typeof p.year === "number" ? p.year : undefined,
    }))
}

function sourceLabel(p: EvidencePassage): string {
  if (p.title) return p.year ? `${p.title} (${p.year})` : p.title
  return p.doi ?? p.openaireId
}

export function CardSourcesEvidence({ result }: { result: unknown }) {
  const t = useTranslations("research.evidence")
  const [open, setOpen] = useState(false)
  const passages = extractPassages(result)
  if (passages.length === 0) return null

  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Eye className="size-3.5 shrink-0 text-brand-teal" strokeWidth={1.8} aria-hidden />
        <span className="font-mono text-[11px] font-semibold text-neutral-100">{t("title")}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("count", { count: passages.length })}
        </span>
        <span className="flex-1" />
        <ChevronDown
          className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="flex flex-col gap-1.5 px-3 pb-3">
          {passages.map((p, i) => {
            const href = citationLinks({ openaireId: p.openaireId, doi: p.doi }).openaire
            return (
              <li
                key={`${p.openaireId}-${i}`}
                className="rounded-md border border-l-2 border-l-brand-teal bg-background px-2.5 py-2"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[9px] text-neutral-600">#{i + 1}</span>
                  <span className="flex-1 truncate text-[10.5px] font-semibold text-neutral-200">
                    {sourceLabel(p)}
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] text-brand-teal">
                    {p.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] italic leading-relaxed text-neutral-400">
                  “{p.snippet}”
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="truncate font-mono text-[9px] text-neutral-600">
                    {p.doi ?? p.openaireId}
                    {p.locator ? ` · ${p.locator}` : ""}
                  </span>
                  <span className="flex-1" />
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-[9px] text-brand-teal hover:underline"
                  >
                    {t("openRecord")}
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
