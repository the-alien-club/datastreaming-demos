"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { AgentCard, type AgentCardData } from "@/components/cards/agent-card"
import { ListToolbar } from "@/components/list-toolbar"

/**
 * Filtering grid used by both /agents and /agents/library.
 * Owner actions are gated by `editable`.
 */
export function AgentsGrid({
  agents,
  authorNames,
  editable = false,
}: {
  agents: AgentCardData[]
  /** Map of userId -> display name; missing entries fall back to "Unknown". */
  authorNames: Record<string, string>
  editable?: boolean
}) {
  const tCommon = useTranslations("common")
  const [query, setQuery] = useState("")

  const normalised = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!normalised) return agents
    return agents.filter((a) => a.name.toLowerCase().includes(normalised))
  }, [agents, normalised])

  return (
    <>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        resultCount={{ total: agents.length, shown: filtered.length }}
      />

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {tCommon("noResults")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              authorName={authorNames[agent.userId] ?? tCommon("unknownAuthor")}
              editable={editable}
            />
          ))}
        </div>
      )}
    </>
  )
}
