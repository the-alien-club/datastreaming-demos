"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Server, Plus, Trash2, Pencil, Loader2, KeyRound, Globe, Lock } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

interface McpRecord {
  id: string
  name: string
  serverUrl: string
  transport: string | null
  authToken: string | null
  description: string | null
  category: string | null
  enabled: boolean | null
  isPublic: boolean
  isOwn: boolean
  createdAt: number | null
  updatedAt: number | null
}

const EMPTY_FORM = {
  name: "",
  serverUrl: "",
  transport: "streamable_http",
  authToken: "",
  description: "",
  category: "",
  enabled: true,
}

type FormState = typeof EMPTY_FORM

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
            category: m.category ?? "",
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
        category: form.category.trim() || null,
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
              onChange={(e) => { field("name", e.target.value); if (nameError) setNameError(false) }}
              aria-invalid={nameError}
              disabled={saving}
            />
            {nameError && (
              <p className="text-sm text-destructive">{t("nameRequired")}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("serverUrlLabel")}</label>
            <Input
              placeholder={t("serverUrlPlaceholder")}
              value={form.serverUrl}
              onChange={(e) => { field("serverUrl", e.target.value); if (urlError) setUrlError(false) }}
              aria-invalid={urlError}
              disabled={saving}
            />
            {urlError && (
              <p className="text-sm text-destructive">{t("serverUrlRequired")}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-sm font-medium">
                {t("categoryLabel")}{" "}
                <span className="text-muted-foreground font-normal">{t("categoryHint")}</span>
              </label>
              <Input
                placeholder={t("categoryPlaceholder")}
                value={form.category}
                onChange={(e) => field("category", e.target.value)}
                disabled={saving}
              />
            </div>
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
            <label htmlFor="enabled" className="text-sm font-medium">{t("enabledLabel")}</label>
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
  const [mcps, setMcps] = useState<McpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { isNew: true } | McpRecord>(null)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setDialog({ isNew: true })}>
          <Plus className="h-4 w-4 mr-2" />
          {t("addMcp")}
        </Button>
      </div>

      {mcps.filter((m) => m.isOwn).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Server className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium mb-4">{t("emptyDescription")}</p>
          <Button onClick={() => setDialog({ isNew: true })}>
            <Plus className="h-4 w-4 mr-2" />
            {t("addMcp")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {mcps.filter((m) => m.isOwn).map((mcp) => (
            <div
              key={mcp.id}
              className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
            >
              <Server className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{mcp.name}</p>
                  {mcp.category && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {mcp.category}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs font-mono">
                    {mcp.transport ?? "streamable_http"}
                  </Badge>
                  {mcp.authToken && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <KeyRound className="h-3 w-3" />
                      auth
                    </Badge>
                  )}
                  {mcp.enabled ? (
                    <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20 text-xs">
                      enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">disabled</Badge>
                  )}
                  {mcp.isPublic && (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                      <Globe className="h-3 w-3" />
                      public
                    </Badge>
                  )}
                </div>
                {mcp.isOwn && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
                    {mcp.serverUrl}
                  </p>
                )}
                {mcp.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {mcp.description}
                  </p>
                )}
              </div>
              {mcp.isOwn && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={publishing === mcp.id}
                    onClick={() => handleTogglePublic(mcp)}
                  >
                    {publishing === mcp.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : mcp.isPublic ? (
                      <><Lock className="h-3 w-3 mr-1" />{t("makePrivate")}</>
                    ) : (
                      <><Globe className="h-3 w-3 mr-1" />{t("makePublic")}</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={toggling === mcp.id}
                    onClick={() => handleToggle(mcp)}
                  >
                    {toggling === mcp.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : mcp.enabled ? (
                      t("disable")
                    ) : (
                      t("enable")
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDialog(mcp)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">{t("dialogEditTitle")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deleting === mcp.id}
                    onClick={() => handleDelete(mcp.id, mcp.name)}
                  >
                    {deleting === mcp.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="sr-only">{t("deleted")}</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mcps.filter((m) => !m.isOwn).length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t("publicSection")}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            {mcps.filter((m) => !m.isOwn).map((mcp) => (
              <div
                key={mcp.id}
                className="rounded-lg border p-4 flex items-start gap-4 hover:bg-muted/20 transition-colors"
              >
                <Server className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{mcp.name}</p>
                    {mcp.category && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {mcp.category}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-mono">
                      {mcp.transport ?? "streamable_http"}
                    </Badge>
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                      <Globe className="h-3 w-3" />
                      public
                    </Badge>
                  </div>
                  {mcp.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {mcp.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
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
