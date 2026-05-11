"use client"

import { useRef, useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Upload, X, FileText, Loader2, CheckCircle2 } from "lucide-react"

type UploadStatus = "pending" | "uploading" | "done" | "error"

interface FileItem {
  file: File
  status: UploadStatus
  error?: string
}

const datasetCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
})

export type FormDatasetCreateData = z.infer<typeof datasetCreateSchema>

// The caller receives the form fields plus the file list they collected.
// Files are managed as local UI state (not a form field) because they are
// updated during upload with per-file status — this matches the audit report
// guidance that "file list management may remain as local state".
export type FormDatasetCreatePayload = FormDatasetCreateData & {
  files: File[]
}

type FormDatasetCreateProps = {
  onSubmit: (data: FormDatasetCreatePayload) => Promise<void>
}

export function FormDatasetCreate({ onSubmit }: FormDatasetCreateProps) {
  const t = useTranslations("datasets.new")
  const tCommon = useTranslations("common")

  const [step, setStep] = useState<1 | 2>(1)
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormDatasetCreateData>({
    resolver: zodResolver(datasetCreateSchema),
    defaultValues: { name: "", description: "" },
  })

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

  async function handleAdvanceToStep2() {
    const valid = await form.trigger(["name"])
    if (!valid) return
    setStep(2)
  }

  async function handleUploadSubmit() {
    // Validate fields one final time before submitting
    const valid = await form.trigger()
    if (!valid) return

    const data = form.getValues()
    await onSubmit({ ...data, files: files.map((f) => f.file) })
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Form {...form}>
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
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tCommon("nameLabel")} *</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("namePlaceholder")}
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tCommon("descriptionLabel")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("descriptionPlaceholder")}
                    className="min-h-24 resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="button"
            onClick={handleAdvanceToStep2}
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
            onClick={() => !isSubmitting && fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
            } ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
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
              disabled={isSubmitting}
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
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              className="flex-1"
            >
              {tCommon("back")}
            </Button>
            <Button
              type="button"
              onClick={handleUploadSubmit}
              disabled={isSubmitting || files.length === 0}
              className="flex-1"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("createUpload")}
            </Button>
          </div>
        </div>
      )}
    </Form>
  )
}
