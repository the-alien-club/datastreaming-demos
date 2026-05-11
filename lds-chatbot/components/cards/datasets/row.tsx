import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Database } from "lucide-react"
import { PrivacyBadge } from "@/components/privacy-badge"
import { timeAgo } from "@/lib/time"
import { DATASET_STATUS } from "@/lib/db/schema"

export type DatasetRowData = {
  id: string
  name: string
  description: string | null
  status: string | null
  isPublic: boolean
  attachedAgentCount: number
  createdAt: number | null
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? DATASET_STATUS.Pending
  if (s === DATASET_STATUS.Ready)
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
        ready
      </Badge>
    )
  if (s === DATASET_STATUS.Processing)
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
        processing
      </Badge>
    )
  if (s === DATASET_STATUS.Error)
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">
        error
      </Badge>
    )
  return <Badge variant="secondary">{s}</Badge>
}

/**
 * Single source of truth for the dataset row UI. The own-page (client)
 * passes its mutation buttons via the `actions` slot; the library page
 * (server) omits it for a read-only render.
 */
export function CardDatasetRow({
  dataset,
  actions,
}: {
  dataset: DatasetRowData
  actions?: ReactNode
}) {
  const t = useTranslations("datasets")

  return (
    <Card className="hover:bg-muted/20 transition-colors">
      <CardContent className="flex items-start gap-4 p-4">
        <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{dataset.name}</p>
            <StatusBadge status={dataset.status} />
            <PrivacyBadge isPublic={dataset.isPublic} />
            {dataset.attachedAgentCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {t("agentsCount", { count: dataset.attachedAgentCount })}
              </Badge>
            )}
          </div>
          {dataset.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {dataset.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{timeAgo(dataset.createdAt)}</p>
        </div>
        {actions && (
          <div className="flex flex-col items-end gap-1 shrink-0 sm:flex-row sm:items-center">
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
