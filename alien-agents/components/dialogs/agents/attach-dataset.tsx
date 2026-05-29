"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SelectAgentDatasetPicker } from "@/components/selects/agents/dataset-picker"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

interface DatasetOption {
  id: string
  name: string
}

interface SubagentSnapshot {
  name: string
  description: string
  systemPrompt: string
  model: string
  mcpIds: string[]
  datasetId: string | null
}

interface AgentSubagentRaw {
  name: string
  systemPrompt: string
  model: string | null
  mcpIds: string | null
  datasetId: string | null
}

interface DialogAgentAttachDatasetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
  datasets: DatasetOption[]
  onAttached: (subagents: SubagentSnapshot[]) => void
}

export function DialogAgentAttachDataset({
  open,
  onOpenChange,
  agentId,
  agentName,
  datasets,
  onAttached,
}: DialogAgentAttachDatasetProps) {
  const t = useTranslations("agents.form")
  const tCommon = useTranslations("common")

  const [attaching, setAttaching] = useState(false)
  const [selectedDatasetId, setSelectedDatasetId] = useState("")

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedDatasetId("")
    }
    onOpenChange(nextOpen)
  }

  async function handleAttach() {
    if (!agentId) {
      toast.error(t("selectAgent"))
      return
    }
    setAttaching(true)
    try {
      const res = await apiFetch(`/api/datasets/${selectedDatasetId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      toast.success(t("attached"))
      handleOpenChange(false)

      // Refresh agent subagents from the server so the UI stays in sync.
      await apiFetch(`/api/datasets/${selectedDatasetId}`)
      const agentRes = await apiFetch(`/api/agents/${agentId}`)
      if (!agentRes.ok) throw new Error(`Failed to refresh agent: HTTP ${agentRes.status}`)
      const agentData = await agentRes.json() as { subagents: AgentSubagentRaw[] }
      onAttached(
        agentData.subagents.map((sa) => ({
          name: sa.name,
          description: "",
          systemPrompt: sa.systemPrompt,
          model: sa.model ?? DEFAULT_MODEL_SLUG,
          mcpIds: sa.mcpIds ? JSON.parse(sa.mcpIds) : [],
          datasetId: sa.datasetId ?? null,
        })),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedAttach"))
    } finally {
      setAttaching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("datasetAttachDialog.title")}</DialogTitle>
          <DialogDescription>{t("datasetAttachDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("datasetAttachDialog.body", { name: agentName })}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="dataset-select">{t("datasetAttachDialog.label")}</Label>
            {datasets.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                {t("datasetAttachDialog.noDatasets")}
              </p>
            ) : (
              <SelectAgentDatasetPicker
                id="dataset-select"
                value={selectedDatasetId}
                onValueChange={setSelectedDatasetId}
                datasets={datasets}
                placeholder={t("datasetAttachDialog.selectDataset")}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={attaching}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleAttach} disabled={attaching || !selectedDatasetId}>
            {attaching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("datasetAttachDialog.attach")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
