/**
 * lib/citations/syntax.ts
 *
 * Pure citation parser/renderer — no server-only imports; safe to use both
 * client-side and server-side.
 *
 * Citation syntax:  [[<openaireId>|<label>]]            (document-level citation → pill)
 *                   [[<openaireId>|<label>|<locator>]]  (passage citation → pill)
 * Note-link syntax: [[note:<id>|<label>]]               (inline link to another note → pill)
 *
 * <openaireId> is the OpenAIRE Graph id of a corpus document (the Document PK),
 * e.g. `doi_dedup___::0123abcd…`. It always contains a double colon `::`, which
 * keeps it fully disjoint from the single-colon `note:` prefix.
 *
 * <locator> is OPTIONAL and pins the citation to a passage of the ingested
 * document:
 *   - `p<N>`     — page N of the fetched full-text PDF (N ≥ 1)
 *   - `s:<id>`   — a logical section of a JATS full-text document (id is a slug,
 *                  e.g. `s:results`, `s:materials-and-methods`)
 *   - `abstract` — the title+abstract chunk
 * Absent locator = the document as a whole (metadata-only records, or a claim
 * spanning the work). External links are DERIVED at render time from the
 * Document row's DOI (see lib/citations/external.ts) — never stored.
 *
 * The note-link form is the INTERNAL cross-reference: the research agent (and
 * the researcher) links one note to another so a complex project's notes
 * interconnect. It carries the target note's UUID and a free-text label; the
 * renderer turns it into a clickable pill that opens the target note. Unlike a
 * citation it is NOT projected to a DB table (render-only) and the `note:`
 * prefix keeps it fully disjoint from the citation form.
 *
 * Rules (from playbook/citations.md):
 *   - <openaireId> must match `[A-Za-z0-9_]+::[A-Za-z0-9]+`
 *   - <label> is free text; `|` and `]]` are escaped with `\` on write and
 *             unescaped on read. The regex captures the escaped form.
 *   - <locator> is `p<N>`, `abstract`, or `s:<slug>`; anything else fails the
 *             match (the raw text then renders as-is, the honest failure mode).
 *
 * CITATION_REGEX is the single definition of valid citation syntax. All code
 * that inspects note bodies must use parseCitations() or this regex — never a
 * hand-rolled scan.
 */

// The `(?<!!)` lookbehind rejects a leading `!` so the figure-embed form
// `![[…|…|fN]]` (below) is parsed as an image, not a citation.
export const CITATION_REGEX =
  /(?<!!)\[\[([A-Za-z0-9_]+::[A-Za-z0-9]+)\|((?:[^|\]]|\\\||\\\])+)(?:\|(p\d+|abstract|s:[A-Za-z0-9_-]+))?\]\]/g

// A figure embed: `![[<openaireId>|<caption>|<figureId>]]` — the `!` prefix (as in
// a markdown image) + a REQUIRED `f<N>` figure id distinguish it from a citation.
// The figure image was extracted by the ingest worker (Mistral OCR) and stored on
// the data-cluster entry; the renderer resolves it via the figure image-proxy route.
export const FIGURE_EMBED_REGEX =
  /!\[\[([A-Za-z0-9_]+::[A-Za-z0-9]+)\|((?:[^|\]]|\\\||\\\])+)\|(f\d+)\]\]/g

// A note-to-note link: `[[note:<uuid>|<label>]]`. The `note:` prefix and the
// canonical UUID shape make it disjoint from CITATION_REGEX (which requires a
// double-colon OpenAIRE id). The `(?<!!)` lookbehind keeps a stray `![[note:…]]`
// from matching. <label> escapes `|` and `]]` exactly like a citation.
export const NOTELINK_REGEX =
  /(?<!!)\[\[note:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\|((?:[^|\]]|\\\||\\\])+)\]\]/g

export type CitationLocator =
  | { kind: "page"; page: number }
  | { kind: "section"; id: string }
  | { kind: "abstract" }

export type ParsedCitation = {
  /** The OpenAIRE Graph id, e.g. `doi_dedup___::0123abcd…`. */
  openaireId: string
  /** Human-readable source label (pipes/brackets already unescaped). */
  label: string
  /** Raw locator token (`p12` | `abstract` | `s:results`) or null for a document-level cite. */
  locator: string | null
  /** Raw matched string as it appears in the note body. */
  raw: string
  /** Character offset of this match in the source string. */
  index: number
  /** Byte-length of the raw match (convenience for slicing). */
  length: number
}

export type ParsedFigureEmbed = {
  /** The OpenAIRE Graph id of the figure's document. */
  openaireId: string
  /** Caption text (pipes/brackets already unescaped). May be empty. */
  caption: string
  /** The figure id within the document, e.g. `f1`. */
  figureId: string
  /** Raw matched string as it appears in the note body. */
  raw: string
  /** Character offset of this match in the source string. */
  index: number
  /** Byte-length of the raw match. */
  length: number
}

export type ParsedNoteLink = {
  /** The target note's UUID. */
  noteId: string
  /** Human-readable link label (pipes/brackets already unescaped). */
  label: string
  /** Raw matched string as it appears in the note body. */
  raw: string
  /** Character offset of this match in the source string. */
  index: number
  /** Byte-length of the raw match (convenience for slicing). */
  length: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeCitationText(s: string): string {
  return s.replaceAll("|", "\\|").replaceAll("]]", "\\]]")
}

export function unescapeCitationText(s: string): string {
  return s.replaceAll("\\|", "|").replaceAll("\\]]", "]]")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all inline citations (`[[…]]`, excluding note links) from a Markdown
 * body. Returns them in source order; label is already unescaped.
 */
export function parseCitations(md: string): ParsedCitation[] {
  const out: ParsedCitation[] = []
  for (const m of md.matchAll(CITATION_REGEX)) {
    out.push({
      openaireId: m[1],
      label: unescapeCitationText(m[2]),
      locator: m[3] ?? null,
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    })
  }
  return out
}

/**
 * Extract all figure embeds (`![[<openaireId>|<caption>|<figureId>]]`) from a
 * Markdown body, in source order; caption is already unescaped.
 */
export function parseFigureEmbeds(md: string): ParsedFigureEmbed[] {
  const out: ParsedFigureEmbed[] = []
  for (const m of md.matchAll(FIGURE_EMBED_REGEX)) {
    out.push({
      openaireId: m[1],
      caption: unescapeCitationText(m[2]),
      figureId: m[3],
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    })
  }
  return out
}

/**
 * Serialize a figure embed back to the `![[openaireId|caption|figureId]]` wire
 * format. Escapes pipes and closing brackets in the caption.
 */
export function renderFigureEmbed(f: {
  openaireId: string
  caption: string
  figureId: string
}): string {
  return `![[${f.openaireId}|${escapeCitationText(f.caption)}|${f.figureId}]]`
}

/**
 * Decode a raw locator token into its structured form.
 * Returns null for a null/malformed token (document-level citation).
 */
export function parseLocator(locator: string | null): CitationLocator | null {
  if (locator == null) return null
  if (locator === "abstract") return { kind: "abstract" }
  const p = /^p(\d+)$/.exec(locator)
  if (p) {
    const page = Number(p[1])
    if (page >= 1) return { kind: "page", page }
  }
  const s = /^s:([A-Za-z0-9_-]+)$/.exec(locator)
  if (s) return { kind: "section", id: s[1] }
  return null
}

/**
 * Extract all note-to-note links (`[[note:<id>|<label>]]`) from a Markdown
 * body, in source order; label is already unescaped.
 */
export function parseNoteLinks(md: string): ParsedNoteLink[] {
  const out: ParsedNoteLink[] = []
  for (const m of md.matchAll(NOTELINK_REGEX)) {
    out.push({
      noteId: m[1],
      label: unescapeCitationText(m[2]),
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    })
  }
  return out
}

/**
 * Serialize a citation back to the `[[openaireId|label|locator]]` wire format
 * (locator omitted when null). Escapes pipes and closing brackets in the label.
 */
export function renderCitation(c: {
  openaireId: string
  label: string
  locator?: string | null
}): string {
  const tail = c.locator ? `|${c.locator}` : ""
  return `[[${c.openaireId}|${escapeCitationText(c.label)}${tail}]]`
}

/**
 * Serialize a note link back to the `[[note:<id>|<label>]]` wire format.
 * Escapes pipes and closing brackets in the label.
 */
export function renderNoteLink(l: { noteId: string; label: string }): string {
  return `[[note:${l.noteId}|${escapeCitationText(l.label)}]]`
}
