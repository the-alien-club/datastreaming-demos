"use client"

// components/cards/corpus/most-cited.tsx
// CardCorpusMostCited — a ranked "most-cited records" chart for the corpus
// Filters & statistics section.
//
// This is deliberately NOT a network graph: the corpus stores per-document
// citation COUNTS (indicators.citationImpact), not the pairwise citation edges
// a real network would need. So rather than fabricate edges, we show what the
// data honestly supports — the most-cited resolved records, ranked, as
// proportional bars (width ∝ citation count, colour by product type). Each row
// links out to the record (DOI resolver when present, else the OpenAIRE Graph).

import { TYPE_DATASET_COLOR } from "@/lib/constants"
import { citationLinks } from "@/lib/citations/external"
import type { DocumentRow } from "@/models/corpus/schema"

interface Props {
  /** The corpus sample (bounded); the most-cited are picked from it. */
  sample: DocumentRow[]
  /** Max rows to plot. */
  max?: number
}

function colorFor(doc: DocumentRow): string {
  const code = doc.instanceType ?? doc.docType ?? "other"
  return TYPE_DATASET_COLOR[code] ?? "var(--dataset-5)"
}

export function CardCorpusMostCited({ sample, max = 8 }: Props) {
  const cited = sample
    .filter((d) => (d.citationCount ?? 0) > 0)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, max)
  if (cited.length === 0) return null

  const maxCites = cited[0].citationCount ?? 1

  return (
    <ol className="flex flex-col gap-2">
      {cited.map((doc) => {
        const cites = doc.citationCount ?? 0
        const color = colorFor(doc)
        const { doi, openaire } = citationLinks(doc)
        const href = doi ?? openaire
        const label = doc.title ?? doc.openaireId
        return (
          <li key={doc.openaireId}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`${label} — ${cites.toLocaleString("en-US")} citations`}
              className="group flex w-full flex-col gap-1 rounded-md p-1 text-left transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="flex-1 truncate text-xs text-foreground group-hover:text-brand-teal">
                  {label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {cites.toLocaleString("en-US")}
                </span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.round((cites / maxCites) * 100)}%`,
                    background: color,
                  }}
                />
              </span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}
