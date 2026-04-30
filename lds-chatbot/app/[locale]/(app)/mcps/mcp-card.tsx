"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Database, Trash2, Pencil, Loader2, KeyRound, Globe, Lock } from "lucide-react"
import { PrivacyBadge } from "@/components/privacy-badge"

export interface McpRecord {
  id: string
  name: string
  serverUrl: string
  transport: string | null
  authToken: string | null
  description: string | null
  categories: string[]
  type: string | null
  provider: string | null
  pricePerQuery: string | null
  enabled: boolean | null
  isPublic: boolean
  isOwn: boolean
  createdAt: number | null
  updatedAt: number | null
}

const MAX_VISIBLE_CATEGORIES = 2

export function McpCard({
  mcp,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTogglePublic,
  busy,
}: {
  mcp: McpRecord
  onEdit?: () => void
  onDelete?: () => void
  onToggleEnabled?: () => void
  onTogglePublic?: () => void
  busy?: { delete?: boolean; enabled?: boolean; publish?: boolean }
}) {
  const t = useTranslations("mcps")
  const visible = mcp.categories.slice(0, MAX_VISIBLE_CATEGORIES)
  const overflow = mcp.categories.length - visible.length
  const isFree = mcp.pricePerQuery?.trim().toLowerCase() === "gratuit"
  const showActions = mcp.isOwn && !!onEdit

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Database className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate">{mcp.name}</span>
              <PrivacyBadge isPublic={mcp.isPublic} />
              {mcp.authToken && mcp.isOwn && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <KeyRound className="h-2.5 w-2.5" />
                  auth
                </Badge>
              )}
            </div>
            {mcp.description && (
              <p className="text-xs font-normal text-muted-foreground mt-0.5 line-clamp-1">
                {mcp.description}
              </p>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-3 flex-1 space-y-3">
        {mcp.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((cat, i) => (
              <Badge
                key={cat}
                className={
                  i === 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs"
                    : "bg-primary/10 text-primary border-primary/20 text-xs"
                }
              >
                {cat}
              </Badge>
            ))}
            {overflow > 0 && (
              <Badge variant="secondary" className="text-xs">
                {t("categoriesMore", { count: overflow })}
              </Badge>
            )}
          </div>
        )}

        <dl className="space-y-1.5 text-sm">
          {mcp.type && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("typeLabel")}:</dt>
              <dd className="font-medium text-right truncate">{mcp.type}</dd>
            </div>
          )}
          {mcp.provider && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("providerLabel")}:</dt>
              <dd className="font-medium text-right truncate">{mcp.provider}</dd>
            </div>
          )}
          {mcp.pricePerQuery && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("priceLabel")}:</dt>
              <dd
                className={
                  isFree
                    ? "font-medium text-right truncate text-emerald-600 dark:text-emerald-400"
                    : "font-medium text-right truncate"
                }
              >
                {mcp.pricePerQuery}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>

      {showActions && (
        <CardFooter className="pt-3 border-t gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={busy?.publish}
            onClick={onTogglePublic}
          >
            {busy?.publish ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : mcp.isPublic ? (
              <>
                <Lock className="h-3 w-3 mr-1" />
                {t("makePrivate")}
              </>
            ) : (
              <>
                <Globe className="h-3 w-3 mr-1" />
                {t("makePublic")}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={busy?.enabled}
            onClick={onToggleEnabled}
          >
            {busy?.enabled ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : mcp.enabled ? (
              t("disable")
            ) : (
              t("enable")
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            <span className="sr-only">{t("dialogEditTitle")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={busy?.delete}
            onClick={onDelete}
          >
            {busy?.delete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <span className="sr-only">{t("deleted")}</span>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
