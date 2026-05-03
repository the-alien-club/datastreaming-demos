"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Database, Plus, Loader2, X, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { McpCard, type McpRecord } from "@/components/cards/mcp-card"
import { ListToolbar } from "@/components/list-toolbar"
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/mcp-options"

const MAX_VISIBLE_CATEGORIES = 2

const EMPTY_FORM = {
  name: "",
  serverUrl: "",
  transport: "streamable_http",
  authToken: "",
  description: "",
  categories: [] as string[],
  type: "",
  provider: "",
  pricePerQuery: "",
  enabled: true,
}

type FormState = typeof EMPTY_FORM

function CategoriesMultiSelect({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  placeholder: string
}) {
  function toggle(category: string, checked: boolean) {
    if (checked) onChange(Array.from(new Set([...value, category])))
    else onChange(value.filter((c) => c !== category))
  }

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={value.length === 0 ? "text-muted-foreground" : ""}>
              {value.length === 0 ? placeholder : `${value.length} sélectionnée(s)`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) max-h-72 overflow-y-auto"
        >
          {CATEGORY_OPTIONS.map((cat) => (
            <DropdownMenuCheckboxItem
              key={cat}
              checked={value.includes(cat)}
              onCheckedChange={(checked) => toggle(cat, checked === true)}
              onSelect={(e) => e.preventDefault()}
            >
              {cat}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((cat) => (
            <Badge
              key={cat}
              variant="outline"
              className="gap-1 pr-1 border-primary/30 bg-primary/5 text-primary"
            >
              {cat}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== cat))}
                disabled={disabled}
                className="hover:bg-primary/15 rounded-sm p-0.5 disabled:opacity-50"
                aria-label={`Remove ${cat}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function McpDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  initial: McpRecord | { isNew: true }
  onClose: () => void
  onSaved: (mcp: McpRecord) => void
}) {
  const t = useTranslations("mcps")
  const tCommon = useTranslations("common")
  const isNew = "isNew" in initial
  const [form, setForm] = useState<FormState>(() =>
    isNew
      ? { ...EMPTY_FORM }
      : (() => {
          const m = initial as McpRecord
          return {
            name: m.name,
            serverUrl: m.serverUrl,
            transport: m.transport ?? "streamable_http",
            authToken: m.authToken ?? "",
            description: m.description ?? "",
            categories: m.categories ?? [],
            type: m.type ?? "",
            provider: m.provider ?? "",
            pricePerQuery: m.pricePerQuery ?? "",
            enabled: m.enabled ?? true,
          }
        })(),
  )
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [urlError, setUrlError] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const hasNameError = !form.name.trim()
    const hasUrlError = !form.serverUrl.trim()
    if (hasNameError || hasUrlError) {
      setNameError(hasNameError)
      setUrlError(hasUrlError)
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        serverUrl: form.serverUrl.trim(),
        transport: form.transport,
        authToken: form.authToken.trim() || null,
        description: form.description.trim() || null,
        categories: form.categories,
        type: form.type.trim() || null,
        provider: form.provider.trim() || null,
        pricePerQuery: form.pricePerQuery.trim() || null,
        enabled: form.enabled,
      }

      const url = isNew ? "/api/mcps" : `/api/mcps/${(initial as McpRecord).id}`
      const method = isNew ? "POST" : "PUT"
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      const saved: McpRecord = await res.json()
      toast.success(isNew ? t("created") : t("updated"))
      onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedSave"))
    } finally {
      setSaving(false)
    }
  }

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? t("dialogAddTitle") : t("dialogEditTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("nameLabel")}</label>
            <Input
              placeholder={t("namePlaceholder")}
              value={form.name}
              onChange={(e) => {
                field("name", e.target.value)
                if (nameError) setNameError(false)
              }}
              aria-invalid={nameError}
              disabled={saving}
            />
            {nameError && <p className="text-sm text-destructive">{t("nameRequired")}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{t("serverUrlLabel")}</label>
            <Input
              placeholder={t("serverUrlPlaceholder")}
              value={form.serverUrl}
              onChange={(e) => {
                field("serverUrl", e.target.value)
                if (urlError) setUrlError(false)
              }}
              aria-invalid={urlError}
              disabled={saving}
            />
            {urlError && <p className="text-sm text-destructive">{t("serverUrlRequired")}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("transportLabel")}</label>
              <Select
                value={form.transport}
                onValueChange={(v) => field("transport", v)}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable_http">streamable_http</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                  <SelectItem value="stdio">stdio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("typeLabel")}</label>
              <Select
                value={form.type || undefined}
                onValueChange={(v) => field("type", v)}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("providerLabel")}</label>
              <Input
                placeholder="EUR-Lex, Etat, Infogreffe…"
                value={form.provider}
                onChange={(e) => field("provider", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("priceLabel")}</label>
              <Input
                placeholder="Gratuit, 0,01 €…"
                value={form.pricePerQuery}
                onChange={(e) => field("pricePerQuery", e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{t("categoriesLabel")}</label>
            <CategoriesMultiSelect
              value={form.categories}
              onChange={(next) => field("categories", next)}
              disabled={saving}
              placeholder={t("categoriesPlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("authTokenLabel")}{" "}
              <span className="text-muted-foreground font-normal">{t("authTokenHint")}</span>
            </label>
            <Input
              type="password"
              placeholder={t("authTokenPlaceholder")}
              value={form.authToken}
              onChange={(e) => field("authToken", e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("descriptionLabel")}{" "}
              <span className="text-muted-foreground font-normal">{t("descriptionHint")}</span>
            </label>
            <Input
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => field("enabled", e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border"
            />
            <label htmlFor="enabled" className="text-sm font-medium">
              {t("enabledLabel")}
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isNew ? t("addButton") : t("saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


export default function McpsPage() {
  const t = useTranslations("mcps")
  const tCommon = useTranslations("common")
  const [mcps, setMcps] = useState<McpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { isNew: true } | McpRecord>(null)

  // Filter state
  const [query, setQuery] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string>("all")

  useEffect(() => {
    apiFetch("/api/mcps")
      .then((r) => r.json())
      .then((data) => setMcps(Array.isArray(data) ? data : []))
      .catch(() => toast.error(t("failedLoad")))
      .finally(() => setLoading(false))
  }, [t])

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
      setMcps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
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
      setMcps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
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
      if (idx === -1) return [mcp, ...prev]
      const next = [...prev]
      next[idx] = mcp
      return next
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
      // Name + provider only — descriptions cross-reference too much.
      const haystack = `${m.name} ${m.provider ?? ""}`.toLowerCase()
      return haystack.includes(normalisedQuery)
    })
  }, [ownMcps, normalisedQuery, typeFilter, selectedCategories])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={t("typeLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("typeLabel")}: {tCommon("filterAll")}</SelectItem>
                    {TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      {t("categoriesLabel")}
                      {selectedCategories.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5">{selectedCategories.length}</Badge>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto w-64">
                    {CATEGORY_OPTIONS.map((cat) => (
                      <DropdownMenuCheckboxItem
                        key={cat}
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={(checked) =>
                          setSelectedCategories((prev) =>
                            checked === true ? [...prev, cat] : prev.filter((c) => c !== cat),
                          )
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {cat}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
          {filteredOwnMcps.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{tCommon("noResults")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOwnMcps.map((mcp) => (
                <McpCard
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
        <McpDialog
          key={"isNew" in dialog ? "new" : dialog.id}
          open={true}
          initial={dialog}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
