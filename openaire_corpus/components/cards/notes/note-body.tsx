"use client"

import { useMemo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import {
  parseCitations,
  parseNoteLinks,
  CITATION_REGEX,
  NOTELINK_REGEX,
} from "@/lib/citations/syntax"
import type { ParsedCitation } from "@/lib/citations/syntax"
import { CitationPill } from "./citation-pill"
import { NoteLinkPill } from "./note-link-pill"

// Fragment tags that carry a citation through markdown rendering. Protocol-less
// (no colon), so react-markdown's urlTransform and rehype-sanitize pass them
// through untouched; the `a` component below swaps them for the real pill.
const CITE_HREF_PREFIX = "#cite-"
const NOTE_HREF_PREFIX = "#note-"

interface NoteBodyProps {
  body: string
  onCitationClick: (c: ParsedCitation) => void
  /** Open another note from a `[[note:<id>|<label>]]` cross-reference. When
   *  omitted, note links render as non-navigating pills. */
  onNoteLinkClick?: (noteId: string) => void
  /** Ids of notes known to exist in this project. When provided, a note link
   *  whose target is absent renders as a greyed dead link. When omitted, every
   *  link is assumed live (avoids false "introuvable" before the list loads). */
  knownNoteIds?: ReadonlySet<string>
}

// Markdown element styles ported 1:1 from the prototype's `mdToHtml`
// (design/BnF Corpus Research.dc.html lines 1582-1604): `###` is a mono
// uppercase eyebrow, `##` a weighted heading, list items carry a teal em-dash,
// and blockquotes get the teal left rule. GFM (tables, etc.) still flows through
// react-markdown, so agent notes richer than the prototype keep rendering.
const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2.5 mt-7 text-[21px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 text-[17px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 font-mono text-xs uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-[1.7] text-neutral-200">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 flex list-none flex-col gap-1.75 pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 flex list-decimal flex-col gap-1.75 pl-5 marker:text-neutral-600">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2.5 text-sm leading-[1.7] text-neutral-200 before:shrink-0 before:text-brand-teal before:content-['—']">
      <span className="min-w-0">{children}</span>
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3.5 border-l-2 border-brand-teal pl-3.5 text-[13.5px] italic leading-[1.6] text-muted-foreground">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-neutral-200">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-brand-teal">
      {children}
    </code>
  ),
  // `a` and `img` are supplied per-instance in NoteBody: `a` maps `#cite-<n>`
  // hrefs to <CitationPill> (else a normal external link), `img` maps `#img-<n>`
  // srcs to a folio <figure>.
  hr: () => <hr className="my-5 border-border" />,
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-2 text-left align-bottom font-mono text-[10.5px] font-medium uppercase tracking-wide whitespace-nowrap text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-3 py-2.5 align-top leading-relaxed text-neutral-200">
      {children}
    </td>
  ),
}

export function NoteBody({
  body,
  onCitationClick,
  onNoteLinkClick,
  knownNoteIds,
}: NoteBodyProps) {
  // Text citations and note links in left-to-right order. The rewrite below
  // numbers its `#cite-<n>` / `#note-<n>` carriers in the same order, so index n
  // maps straight back to the matching parsed token. The two regexes are disjoint
  // on the original tokens (citation needs a `::` id; note link needs `note:`).
  const citations = useMemo(() => parseCitations(body), [body])
  const noteLinks = useMemo(() => parseNoteLinks(body), [body])

  // Rewrite citation/note-link tokens into inline markdown on the RAW body,
  // BEFORE parsing. Citations become `[n](#cite-n)`, note links `[n](#note-n)` —
  // both stay in their phrasing context instead of breaking block flow. Must run
  // pre-parse: once markdown is parsed, `[[…]]` is ambiguous and no longer
  // survives as plain text a post-parse plugin could match.
  const markdown = useMemo(() => {
    let cite = 0
    let note = 0
    return body
      .replace(CITATION_REGEX, () => `[${cite}](${CITE_HREF_PREFIX}${cite++})`)
      .replace(NOTELINK_REGEX, () => `[${note}](${NOTE_HREF_PREFIX}${note++})`)
  }, [body])

  const components: Components = useMemo(
    () => ({
      ...MD_COMPONENTS,
      a: ({ href, children }) => {
        if (href?.startsWith(CITE_HREF_PREFIX)) {
          const citation = citations[Number(href.slice(CITE_HREF_PREFIX.length))]
          if (citation) {
            return <CitationPill citation={citation} onClick={onCitationClick} />
          }
        }
        if (href?.startsWith(NOTE_HREF_PREFIX)) {
          const link = noteLinks[Number(href.slice(NOTE_HREF_PREFIX.length))]
          if (link) {
            // Absent from a provided id set → dead link. With no set provided we
            // assume live (the list may not have loaded yet).
            const exists = knownNoteIds ? knownNoteIds.has(link.noteId) : true
            return (
              <NoteLinkPill
                label={link.label}
                exists={exists}
                onClick={
                  exists && onNoteLinkClick
                    ? () => onNoteLinkClick(link.noteId)
                    : undefined
                }
              />
            )
          }
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal underline underline-offset-2 hover:text-brand-teal/80"
          >
            {children}
          </a>
        )
      },
    }),
    [citations, noteLinks, knownNoteIds, onCitationClick, onNoteLinkClick],
  )

  return (
    <div className="max-w-none text-neutral-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
