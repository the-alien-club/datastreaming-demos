// lib/notes/export.ts
// Export a note (or the whole notebook) as PORTABLE Markdown — the kind a normal
// viewer renders. Our internal note body uses OpenAIRE-specific syntax that no
// other renderer understands:
//   [[openaireId|label|locator]]  inline citation (locator optional: p<N> | abstract)
//   [[note:<id>|label]]           internal note-to-note cross-reference
// Citations are rewritten into standard Markdown links pointing at the OpenAIRE
// Explore record (the one URL derivable from the id alone — the DOI is not
// carried in the citation token, so a DOI deep-link would require a DB lookup we
// deliberately keep out of this pure function).
//
// Shared by the Atelier (single active note), the in-workspace Notebook, and the
// standalone Notebook page so all three export the same way.

import {
  CITATION_REGEX,
  NOTELINK_REGEX,
  unescapeCitationText,
} from "@/lib/citations/syntax"
import { openaireRecordUrl } from "@/lib/citations/external"

type ExportableNote = { title: string; body_md: string | null }

/** Escape the characters that would break Markdown link text. */
function escapeLinkText(label: string): string {
  return label.replace(/[[\]]/g, "\\$&")
}

/** Human suffix for a passage locator ("p12" → " (p. 12)", "abstract" →
 *  " (abstract)", "s:results" → " (§ results)"). */
function locatorSuffix(locator: string | undefined): string {
  if (!locator) return ""
  if (locator === "abstract") return " (abstract)"
  const p = /^p(\d+)$/.exec(locator)
  if (p) return ` (p. ${p[1]})`
  const s = /^s:([A-Za-z0-9_-]+)$/.exec(locator)
  if (s) return ` (§ ${s[1].replace(/[-_]/g, " ")})`
  return ""
}

/**
 * Rewrite our internal citation/note-link syntax into standard Markdown:
 *   [[openaireId|label|locator]] → [label (p. N)](OpenAIRE record)
 *   [[note:<id>|label]]          → **label**   (internal ref; no portable URL)
 */
export function toPortableMarkdown(body: string): string {
  return body
    .replace(
      CITATION_REGEX,
      (_m, openaireId: string, label: string, locator?: string) => {
        const caption =
          escapeLinkText(unescapeCitationText(label)) + locatorSuffix(locator)
        return `[${caption}](${openaireRecordUrl(openaireId)})`
      },
    )
    .replace(NOTELINK_REGEX, (_m, _id: string, label: string) => {
      return `**${escapeLinkText(unescapeCitationText(label))}**`
    })
}

/** One note as a standalone Markdown document (`# Title` + portable body). */
export function noteToMarkdown(note: ExportableNote): string {
  return `# ${note.title}\n\n${toPortableMarkdown(note.body_md ?? "")}\n`
}

/** Several notes stitched into one document, `---` between entries. */
export function notesToMarkdown(notes: ExportableNote[]): string {
  return notes
    .map((n) => `## ${n.title}\n\n${toPortableMarkdown(n.body_md ?? "")}\n`)
    .join("\n---\n\n")
}

/** kebab-case a title into a safe filename stem; `fallback` when it folds away. */
export function filenameFromTitle(title: string, fallback: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return `${slug || fallback}.md`
}

/** Trigger a browser download of `content` as `filename`. Client-only. */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
