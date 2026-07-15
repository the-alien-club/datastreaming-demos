import "server-only"
import { prisma } from "@/lib/db"
import type { NoteWithCitations, NoteListItem, NoteVersionListItem } from "./schema"

export class NoteQueries {
  static async listForProject(projectId: string): Promise<NoteListItem[]> {
    return prisma.note.findMany({
      where: { projectId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        updatedAt: true,
        citationCount: true,
        pinned: true,
        createdAt: true,
      },
    })
  }

  static async get(id: string): Promise<NoteWithCitations | null> {
    return prisma.note.findUnique({
      where: { id },
      include: { citations: true },
    }) as Promise<NoteWithCitations | null>
  }

  static async listVersions(noteId: string): Promise<NoteVersionListItem[]> {
    return prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { seq: "desc" },
      select: { id: true, seq: true, createdAt: true },
    })
  }

  static async citationsForId(
    projectId: string,
    openaireId: string,
  ): Promise<{ noteId: string; locator: string | null; label: string | null; noteTitle: string }[]> {
    const rows = await prisma.citation.findMany({
      where: { openaireId, note: { projectId } },
      select: {
        noteId: true,
        locator: true,
        label: true,
        note: { select: { title: true } },
      },
    })
    return rows.map((r) => ({
      noteId: r.noteId,
      locator: r.locator,
      label: r.label,
      noteTitle: r.note.title,
    }))
  }
}
