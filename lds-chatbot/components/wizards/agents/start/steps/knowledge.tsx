"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { WIZARD_AGENT_TEMPLATES } from "../templates"
import type { KnowledgeMode, WizardSetState, WizardState } from "../state"

interface DatasetRow {
  id: string
  name: string
  description: string | null
  status: string | null
  attachedAgentCount?: number
}

interface KnowledgeStepContentProps {
  state: WizardState
  setState: WizardSetState
  uploadInFlight?: boolean
}

export function KnowledgeStepContent({
  state,
  setState,
  uploadInFlight = false,
}: KnowledgeStepContentProps) {
  const t = useTranslations("wizard")
  const template = WIZARD_AGENT_TEMPLATES.find((tpl) => tpl.id === state.templateId)
  const knowledgeRequired = template?.knowledgeRequired ?? false

  const [datasets, setDatasets] = useState<DatasetRow[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(false)
  const uploadDone = state.uploadedDatasetIds.length > 0

  useEffect(() => {
    if (state.knowledgeMode !== "existing") return
    let cancelled = false
    void (async () => {
      setLoadingDatasets(true)
      try {
        const res = await apiFetch("/api/datasets")
        const data = res.ok ? ((await res.json()) as DatasetRow[]) : []
        if (!cancelled) setDatasets(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setDatasets([])
      } finally {
        if (!cancelled) setLoadingDatasets(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state.knowledgeMode])

  function setMode(mode: KnowledgeMode) {
    setState((prev) => ({ ...prev, knowledgeMode: mode }))
  }

  function toggleExisting(id: string) {
    setState((prev) => {
      const has = prev.selectedExistingDatasetIds.includes(id)
      return {
        ...prev,
        selectedExistingDatasetIds: has
          ? prev.selectedExistingDatasetIds.filter((d) => d !== id)
          : [...prev.selectedExistingDatasetIds, id],
      }
    })
  }

  function onFilesPicked(fileList: FileList | null) {
    if (!fileList) return
    const newFiles = Array.from(fileList)
    setState((prev) => ({ ...prev, uploadFiles: [...prev.uploadFiles, ...newFiles] }))
  }

  function removeFile(idx: number) {
    setState((prev) => ({
      ...prev,
      uploadFiles: prev.uploadFiles.filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      <Tabs value={state.knowledgeMode} onValueChange={(v) => setMode(v as KnowledgeMode)}>
        <TabsList>
          <TabsTrigger value="existing">{t("knowledgeExisting")}</TabsTrigger>
          <TabsTrigger value="upload">{t("knowledgeUpload")}</TabsTrigger>
        </TabsList>

        <TabsContent value="existing">
          {loadingDatasets ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("knowledgeLoading")}
            </div>
          ) : datasets.length === 0 ? (
            <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
              {t("knowledgeNoDatasets")}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {datasets.map((d) => {
                const status = d.status ?? "pending"
                const isError = status === "error"
                const checked = state.selectedExistingDatasetIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={isError}
                    onClick={() => toggleExisting(d.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                      checked
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : "border-border hover:bg-accent/30",
                      isError && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{d.name}</span>
                      {d.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {d.description}
                        </span>
                      )}
                    </div>
                    <Badge variant={isError ? "destructive" : "secondary"} className="text-[10px]">
                      {status}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upload">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="wizard-dataset-name">{t("knowledgeDatasetNameLabel")}</Label>
              <Input
                id="wizard-dataset-name"
                value={state.uploadDatasetName}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, uploadDatasetName: e.target.value }))
                }
                placeholder={t("knowledgeDatasetNamePlaceholder")}
                disabled={uploadInFlight || uploadDone}
              />
            </div>

            <label
              htmlFor="wizard-dataset-files"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-6 text-sm text-muted-foreground transition-colors",
                (uploadInFlight || uploadDone) && "pointer-events-none opacity-60",
                "hover:bg-accent/30",
              )}
            >
              <Upload className="size-5" />
              <span>{t("knowledgeDropzone")}</span>
              <input
                id="wizard-dataset-files"
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => onFilesPicked(e.target.files)}
              />
            </label>

            {state.uploadFiles.length > 0 && (
              <div className="space-y-1">
                {state.uploadFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{file.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                    {!uploadInFlight && !uploadDone && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => removeFile(idx)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {uploadInFlight ? (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                {t("knowledgeUploading")}
              </p>
            ) : uploadDone ? (
              <p className="text-xs text-muted-foreground">{t("knowledgeUploaded")}</p>
            ) : state.uploadFiles.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t("knowledgeClickNext")}</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground italic">
        {knowledgeRequired ? t("knowledgeRequiredSwitch") : t("knowledgeSkipHint")}
      </p>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
