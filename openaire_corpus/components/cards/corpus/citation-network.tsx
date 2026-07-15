"use client"

// components/cards/corpus/citation-network.tsx
// A small decorative-but-data-driven "citation network" hero for the corpus
// Filters & statistics section (design prototype: a 184×118 SVG of top-cited
// records as nodes, edges as co-citation links, coloured by product type).
//
// We do NOT have real co-citation edges in the corpus snapshot, so this plots
// the corpus's most-cited RESOLVED documents as nodes (radius ∝ citation count,
// colour by instanceType) on a deterministic organic layout, with faint links
// from each node to the single most-cited node — an honest "co-citation around
// the anchors" motif, never fabricated pairwise edges. Positions are derived
// from the node index via trig (no Math.random — deterministic across renders).

import { useMemo } from "react"
import { TYPE_DATASET_COLOR } from "@/lib/constants"
import type { DocumentRow } from "@/models/corpus/schema"

interface Props {
  /** The corpus sample (bounded); the most-cited are picked from it. */
  sample: DocumentRow[]
  /** Max nodes to plot. */
  max?: number
}

const W = 184
const H = 118
const CX = W / 2
const CY = H / 2

function colorFor(doc: DocumentRow): string {
  const code = doc.instanceType ?? doc.docType ?? "other"
  return TYPE_DATASET_COLOR[code] ?? "var(--dataset-5)"
}

export function CardCorpusCitationNetwork({ sample, max = 9 }: Props) {
  const nodes = useMemo(() => {
    const cited = sample
      .filter((d) => (d.citationCount ?? 0) > 0)
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, max)
    if (cited.length === 0) return []

    const maxCites = cited[0].citationCount ?? 1
    // Anchor (most-cited) at the centre; the rest on a ring, radius modulated by
    // index so the layout reads as organic rather than a perfect polygon.
    return cited.map((doc, i) => {
      const cites = doc.citationCount ?? 0
      const r = 3 + Math.sqrt(cites / maxCites) * 7 // node radius 3–10px
      if (i === 0) return { doc, x: CX, y: CY, r, anchor: true }
      const angle = (i / (cited.length - 1)) * Math.PI * 2
      const ring = 30 + (i % 3) * 14
      return {
        doc,
        x: CX + Math.cos(angle) * ring,
        y: CY + Math.sin(angle) * (ring * 0.62),
        r,
        anchor: false,
      }
    })
  }, [sample, max])

  if (nodes.length === 0) return null

  const anchor = nodes[0]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="h-auto w-full"
      role="img"
      aria-label="Citation network of the most-cited records"
    >
      {/* Links: each satellite → the anchor (most-cited) node. */}
      <g stroke="var(--border)" strokeWidth="0.6" opacity="0.6">
        {nodes.slice(1).map((n) => (
          <line key={`l-${n.doc.openaireId}`} x1={anchor.x} y1={anchor.y} x2={n.x} y2={n.y} />
        ))}
      </g>
      {/* Nodes. */}
      <g>
        {nodes.map((n) => (
          <circle
            key={n.doc.openaireId}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={colorFor(n.doc)}
            fillOpacity={n.anchor ? 0.9 : 0.7}
            stroke={n.anchor ? "var(--brand-teal)" : "transparent"}
            strokeWidth={n.anchor ? 1 : 0}
          >
            <title>
              {(n.doc.title ?? n.doc.openaireId) +
                ` — ${n.doc.citationCount ?? 0} citations`}
            </title>
          </circle>
        ))}
      </g>
    </svg>
  )
}
