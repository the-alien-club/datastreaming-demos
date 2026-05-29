"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SelectDatasetAgentPicker } from "@/components/selects/datasets/agent-picker"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

interface AgentRecord {
  id: string
  name: string
  isOwn: boolean
}

interface DialogDatasetAttachAgentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  datasetName: string
  onAttached: () => void
}

export function DialogDatasetAttachAgent({
  open,
  onOpenChange,
  datasetId,
  datasetName,
  onAttached,
}: DialogDatasetAttachAgentProps) {
  const t = useTranslations("datasets.detail")
  const tCommon = useTranslations("common")

  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [attaching, setAttaching] = useState(false)
  useEffect(() => {
    if (!open) {
      setSelectedAgentId("")
      setAgents([])
      return
    }
    async function fetchAgents() {
      try {
        const res = await apiFetch("/api/agents")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setAgents(Array.isArray(data) ? data.filter((a: AgentRecord) => a.isOwn) : [])
      } catch {
        toast.error(t("failedLoadAgents"))
      }
    }
    fetchAgents()
  }, [open])

  async function handleAttach() {
    if (!selectedAgentId) {
      toast.error(t("selectAgent"))
      return
    }
    setAttaching(true)
    try {
      const res = await apiFetch(`/api/datasets/${datasetId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      toast.success(t("attached"))
      onOpenChange(false)
      setSelectedAgentId("")
      onAttached()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedAttach"))
    } finally {
      setAttaching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("attachDialogTitle")}</DialogTitle>
          <DialogDescription>{t("attachDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("attachDialogBody", { name: datasetName })}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="agent-select">{t("agentLabel")}</Label>
            {agents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">{t("noAgents")}</p>
            ) : (
              <SelectDatasetAgentPicker
                id="agent-select"
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
                agents={agents}
                placeholder={t("selectAgent")}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={attaching}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleAttach} disabled={attaching || !selectedAgentId}>
            {attaching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("attach")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
