"use client"

import { useState, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Upload, X, FileText, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

type UploadStatus = "pending" | "uploading" | "done" | "error"

interface FileItem {
  file: File
  status: UploadStatus
  error?: string
}

type Step = 1 | 2

export default function NewDatasetPage() {
  const t = useTranslations("datasetNew")
  const tCommon = useTranslations("common")
  const router = useRouter()

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState(false)
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<FileItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming)
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.file.name))
      const fresh = list
        .filter((f) => !existingNames.has(f.name))
        .map((f) => ({ file: f, status: "pending" as UploadStatus }))
      return [...prev, ...fresh]
    })
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [])

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error(tCommon("nameRequired"))
      return
    }
    if (files.length === 0) {
      toast.error(t("atLeastOneFile"))
      return
    }

    setSubmitting(true)

    try {
      const createResponse = await apiFetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      })

      if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${createResponse.status}`)
      }

      const dataset = await createResponse.json()
      const datasetId: string = dataset.id

      for (let i = 0; i < files.length; i++) {
        setFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item))
        )

        const formData = new FormData()
        formData.append("file", files[i].file)

        try {
          const uploadResponse = await apiFetch(`/api/datasets/${datasetId}/entries`, {
            method: "POST",
            body: formData,
          })

          if (!uploadResponse.ok) {
            const errBody = await uploadResponse.json().catch(() => ({ error: "Upload failed" }))
            throw new Error(errBody.error ?? `HTTP ${uploadResponse.status}`)
          }

          setFiles((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: "done" } : item))
          )
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed"
          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: msg } : item
            )
          )
        }
      }

      toast.success(t("created"))
      router.push(`/datasets/${datasetId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedCreate"))
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/datasets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            step === 1
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("step1Label")}
        </span>
        <span className="text-muted-foreground text-xs">→</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            step === 2
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("step2Label")}
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">{tCommon("nameLabel")} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false) }}
              placeholder={t("namePlaceholder")}
              aria-invalid={nameError}
              autoFocus
            />
            {nameError && (
              <p className="text-sm text-destructive">{tCommon("nameRequired")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{tCommon("descriptionLabel")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className="min-h-24 resize-y"
            />
          </div>
          <Button
            onClick={() => {
              if (!name.trim()) {
                setNameError(true)
                return
              }
              setStep(2)
            }}
            className="w-full"
          >
            {tCommon("next")}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div
            onDragEnter={() => setDragActive(true)}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => !submitting && fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
            } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("dropzoneText")}{" "}
              <span className="text-foreground font-medium">{t("dropzoneClick")}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("dropzoneFormats")}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              disabled={submitting}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="flex-1 text-sm truncate">{item.file.name}</p>
                  <div className="shrink-0">
                    {item.status === "pending" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(idx)
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {item.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {item.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {item.status === "error" && (
                      <span className="text-xs text-destructive">{item.error ?? "Error"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="flex-1"
            >
              {tCommon("back")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || files.length === 0}
              className="flex-1"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("createUpload")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
