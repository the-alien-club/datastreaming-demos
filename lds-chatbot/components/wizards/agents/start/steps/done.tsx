"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Loader2, Settings } from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { WIZARD_DATASET_POLL_INTERVAL_MS } from "@/lib/constants"
import { ENTRY_STATUS } from "@/lib/db/schema"
import type { WizardState } from "../state"

interface DoneStepContentProps {
  state: WizardState
  onClose: () => void
  /** Called instead of onClose when the user navigates to advanced settings,
   *  so the wizard cleanup effect knows the agent should NOT be deleted. */
  onComplete: () => void
}

interface DatasetStatusResponse {
  datasetId: string
  totalEntries: number
  byStatus: Record<string, number>
  overall: "empty" | "uploading" | "processing" | "processed" | "error"
}

export function DoneStepContent({ state, onClose, onComplete }: DoneStepContentProps) {
  const t = useTranslations("wizard.steps.done")
  const [statusByDataset, setStatusByDataset] = useState<Record<string, DatasetStatusResponse>>({})

  useEffect(() => {
    if (state.uploadedDatasetIds.length === 0) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      const next: Record<string, DatasetStatusResponse> = {}
      for (const id of state.uploadedDatasetIds) {
        try {
          const res = await apiFetch(`/api/datasets/${id}/status`)
          if (!res.ok) continue
          const data = (await res.json()) as DatasetStatusResponse
          next[id] = data
        } catch {
          // Ignore transient failures and let the next tick retry.
        }
      }
      if (cancelled) return
      setStatusByDataset(next)

      const allDone = state.uploadedDatasetIds.every(
        (id) => next[id]?.overall === ENTRY_STATUS.Processed || next[id]?.overall === ENTRY_STATUS.Error,
      )
      if (!allDone) {
        timer = setTimeout(poll, WIZARD_DATASET_POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [state.uploadedDatasetIds])

  const documentCount =
    state.uploadedDatasetIds.reduce(
      (acc, id) => acc + (statusByDataset[id]?.totalEntries ?? 0),
      0,
    ) + state.selectedExistingDatasetIds.length

  const stillProcessing = state.uploadedDatasetIds.some(
    (id) =>
      statusByDataset[id] &&
      statusByDataset[id].overall !== ENTRY_STATUS.Processed &&
      statusByDataset[id].overall !== ENTRY_STATUS.Error,
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="size-5 text-primary" />
        <span className="font-semibold">{t("doneReady")}</span>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold">{state.name}</div>
              {state.description && (
                <div className="text-xs text-muted-foreground">{state.description}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Badge variant="secondary" className="text-[10px]">
                {state.model}
              </Badge>
              {state.specialistName && (
                <Badge variant="outline" className="text-[10px]">
                  {state.specialistName}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {t("doneTools", { count: state.selectedMcpIds.length })}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {t("doneDocs", { count: documentCount })}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {stillProcessing && (
        <Card>
          <CardContent className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{t("doneProcessing")}</span>
          </CardContent>
        </Card>
      )}

      {state.agentId && (
        <div className="text-xs">
          <Link
            href={`/agents/${state.agentId}`}
            onClick={onComplete}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <Settings className="size-3.5" /> {t("doneAdvancedSettings")}
          </Link>
        </div>
      )}
    </div>
  )
}
