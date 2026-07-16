"use client"

import { NoteBody } from "./note-body"
import type { ParsedCitation } from "@/lib/citations/syntax"

interface CarnetEntryProps {
  projectId: string
  note: {
    id: string
    title: string
    body_md: string | null
    createdAt: Date | string
  }
  onCitationClick: (c: ParsedCitation) => void
  onNoteLinkClick?: (noteId: string) => void
  knownNoteIds?: ReadonlySet<string>
}

export function CarnetEntry({
  projectId,
  note,
  onCitationClick,
  onNoteLinkClick,
  knownNoteIds,
}: CarnetEntryProps) {
  const date = new Date(note.createdAt)
  const dateStr = date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  return (
    <article id={note.id} className="scroll-mt-4">
      <h2 className="text-xl font-semibold mb-1">{note.title}</h2>
      <p className="text-xs text-muted-foreground mb-4">{dateStr}</p>
      <NoteBody
        body={note.body_md ?? ""}
        projectId={projectId}
        onCitationClick={onCitationClick}
        onNoteLinkClick={onNoteLinkClick}
        knownNoteIds={knownNoteIds}
      />
    </article>
  )
}
