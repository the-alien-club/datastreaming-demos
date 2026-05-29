"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import {
  CardSpecialist,
  type SpecialistCardData,
} from "@/components/cards/specialists/specialist"
import { ListToolbar } from "@/components/list-toolbar"

export function LayoutSpecialistsGrid({
  specialists,
  mcpNames,
  authorNames,
  editable = false,
  forkable = false,
}: {
  specialists: SpecialistCardData[]
  /** Plain object (vs Map) so it survives the server→client boundary. */
  mcpNames: Record<string, string>
  authorNames: Record<string, string>
  editable?: boolean
  forkable?: boolean
}) {
  const tCommon = useTranslations("common")
  const [query, setQuery] = useState("")
  const mcpNamesMap = useMemo(() => new Map(Object.entries(mcpNames)), [mcpNames])

  const normalised = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!normalised) return specialists
    // Name-only match. Description text often cross-references other tools
    // ("for X use KALI instead"), which made name searches return everything.
    return specialists.filter((s) => s.name.toLowerCase().includes(normalised))
  }, [specialists, normalised])

  return (
    <>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        resultCount={{ total: specialists.length, shown: filtered.length }}
      />

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((specialist) => (
            <CardSpecialist
              key={specialist.id}
              specialist={specialist}
              mcpNames={mcpNamesMap}
              authorName={authorNames[specialist.userId] ?? tCommon("unknownAuthor")}
              editable={editable}
              forkable={forkable}
            />
          ))}
        </div>
      )}
    </>
  )
}
