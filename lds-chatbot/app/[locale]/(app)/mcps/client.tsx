"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Database, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { CardMcp, type McpRecord } from "@/components/cards/mcps/mcp"
import { ListToolbar } from "@/components/list-toolbar"
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/mcp-options"
import { DialogMcpEdit } from "@/components/dialogs/mcps/edit"
import { SelectMcpTypeFilter } from "@/components/selects/mcps/type-filter"
import { DropdownMcpColumnFilter } from "@/components/dropdowns/mcps/column-filter"

type McpsClientProps = {
  initialMcps: McpRecord[]
}

export function McpsClient({ initialMcps }: McpsClientProps) {
  const t = useTranslations("mcps")
  const tCommon = useTranslations("common")
  const [mcps, setMcps] = useState<McpRecord[]>(initialMcps)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { isNew: true } | McpRecord>(null)

  // Filter state
  const [query, setQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string>("all")

  async function handleDelete(id: string, name: string) {
    if (!confirm(t("confirmDelete", { name }))) return
    setDeleting(id)
    try {
      const res = await apiFetch(`/api/mcps/${id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
      setMcps((prev) => prev.filter((m) => m.id !== id))
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedDelete"))
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggle(mcp: McpRecord) {
    setToggling(mcp.id)
    try {
      const res = await apiFetch(`/api/mcps/${mcp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !mcp.enabled }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: McpRecord = await res.json()
      setMcps((prev) => prev.map((m) => (m.id === updated.id ? { ...updated, isOwn: m.isOwn } : m)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedUpdate"))
    } finally {
      setToggling(null)
    }
  }

  async function handleTogglePublic(mcp: McpRecord) {
    setPublishing(mcp.id)
    try {
      const res = await apiFetch(`/api/mcps/${mcp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !mcp.isPublic }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: McpRecord = await res.json()
      setMcps((prev) => prev.map((m) => (m.id === updated.id ? { ...updated, isOwn: m.isOwn } : m)))
      toast.success(updated.isPublic ? t("published") : t("madePrivate"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedUpdate"))
    } finally {
      setPublishing(null)
    }
  }

  function handleSaved(mcp: McpRecord) {
    setMcps((prev) => {
      const idx = prev.findIndex((m) => m.id === mcp.id)
      if (idx === -1) return [{ ...mcp, isOwn: true }, ...prev]
      const updated = [...prev]
      updated[idx] = { ...mcp, isOwn: prev[idx].isOwn }
      return updated
    })
  }

  const ownMcps = useMemo(() => mcps.filter((m) => m.isOwn), [mcps])
  const normalisedQuery = query.trim().toLowerCase()
  const filteredOwnMcps = useMemo(() => {
    return ownMcps.filter((m) => {
      if (typeFilter !== "all" && (m.type ?? "") !== typeFilter) return false
      if (selectedCategories.length > 0 && !selectedCategories.some((c) => m.categories.includes(c))) {
        return false
      }
      if (!normalisedQuery) return true
      const haystack = `${m.name} ${m.provider ?? ""}`.toLowerCase()
      return haystack.includes(normalisedQuery)
    })
  }, [ownMcps, normalisedQuery, typeFilter, selectedCategories])

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("myTitle")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("mySubtitle")}</p>
        </div>
        <Button onClick={() => setDialog({ isNew: true })} className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t("addMcp")}
        </Button>
      </div>

      {ownMcps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Database className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium mb-4">{t("emptyDescription")}</p>
          <Button onClick={() => setDialog({ isNew: true })}>
            <Plus className="h-4 w-4 mr-2" />
            {t("addMcp")}
          </Button>
        </div>
      ) : (
        <>
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            resultCount={{ total: ownMcps.length, shown: filteredOwnMcps.length }}
            filters={
              <>
                <SelectMcpTypeFilter
                  value={typeFilter}
                  onValueChange={setTypeFilter}
                  options={[...TYPE_OPTIONS]}
                />
                <DropdownMcpColumnFilter
                  value={selectedCategories}
                  onChange={setSelectedCategories}
                  options={[...CATEGORY_OPTIONS]}
                />
              </>
            }
          />
          {filteredOwnMcps.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOwnMcps.map((mcp) => (
                <CardMcp
                  key={mcp.id}
                  mcp={mcp}
                  onEdit={() => setDialog(mcp)}
                  onDelete={() => handleDelete(mcp.id, mcp.name)}
                  onToggleEnabled={() => handleToggle(mcp)}
                  onTogglePublic={() => handleTogglePublic(mcp)}
                  busy={{
                    delete: deleting === mcp.id,
                    enabled: toggling === mcp.id,
                    publish: publishing === mcp.id,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {dialog && (
        <DialogMcpEdit
          key={"isNew" in dialog ? "new" : dialog.id}
          open={true}
          onOpenChange={(v) => !v && setDialog(null)}
          initial={dialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
