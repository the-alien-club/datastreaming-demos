"use client"

// hooks/api/citations.ts
// TanStack Query hook for citation lookups by OpenAIRE id within a project.

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-fetch"

// Shape returned by NoteQueries.citationsForId — kept inline here since it is a
// projection (not a full schema type) and is small enough to avoid a separate
// import chain.
export type CitationUsage = {
  noteId: string
  locator: string | null
  label: string | null
  noteTitle: string
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const citationKeys = {
  forId: (projectId: string, openaireId: string) =>
    ["citations", projectId, openaireId] as const,
}

// ── Read hook ─────────────────────────────────────────────────────────────────

/**
 * Fetch all citation usages for a given OpenAIRE id within a project.
 * The query is disabled when `openaireId` is null — safe to call unconditionally.
 */
export function useCitationsForId(projectId: string, openaireId: string | null) {
  return useQuery<CitationUsage[]>({
    queryKey: openaireId
      ? citationKeys.forId(projectId, openaireId)
      : ["citations", projectId, null],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/projects/${projectId}/citations?openaireId=${encodeURIComponent(openaireId!)}`,
      )
      if (!res.ok) throw new Error("Failed to fetch citation usages")
      return res.json() as Promise<CitationUsage[]>
    },
    enabled: !!openaireId,
  })
}
