"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter, Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

import type { PublicAIModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { type McpOption } from "@/components/forms/specialists/create"
import {
  FormSpecialistEdit,
  type FormSpecialistEditData,
} from "@/components/forms/specialists/edit"

type AIModel = PublicAIModel

export interface SpecialistRecord {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  model: string | null
  mcpIds: string | null
  isForkable: boolean
}

type SpecialistDetailClientProps = {
  initialSpecialist: SpecialistRecord
  initialModels: AIModel[]
  initialMcpList: McpOption[]
}

export function SpecialistDetailClient({
  initialSpecialist,
  initialModels,
  initialMcpList,
}: SpecialistDetailClientProps) {
  const { id } = initialSpecialist
  const t = useTranslations("specialists.form")
  const tSpec = useTranslations("specialists")
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [specialistName, setSpecialistName] = useState(initialSpecialist.name)

  async function handleSave(data: FormSpecialistEditData) {
    setSaving(true)
    const response = await apiFetch(`/api/specialists/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description?.trim() || null,
        systemPrompt: data.systemPrompt.trim(),
        model: data.model,
        mcpIds: data.mcpIds,
        isForkable: data.isForkable,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(err.error ?? `HTTP ${response.status}`)
    }
    setSpecialistName(data.name.trim())
    toast.success(tSpec("saved"))
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(tSpec("confirmDelete"))) return
    setDeleting(true)
    try {
      const response = await apiFetch(`/api/specialists/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP ${response.status}`)
      }
      toast.success(tSpec("deleted"))
      router.push("/specialists")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tSpec("failedSave"))
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/specialists">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex-1 truncate">{specialistName}</h1>
      </div>

      <div className="space-y-5">
        <FormSpecialistEdit
          initialValues={{
            name: initialSpecialist.name,
            description: initialSpecialist.description ?? "",
            systemPrompt: initialSpecialist.systemPrompt,
            model: initialSpecialist.model ?? DEFAULT_MODEL_SLUG,
            mcpIds: initialSpecialist.mcpIds
              ? JSON.parse(initialSpecialist.mcpIds)
              : [],
            isForkable: initialSpecialist.isForkable,
          }}
          models={initialModels}
          availableMcps={initialMcpList}
          hideSubmit
          onSubmit={async (data) => {
            try {
              await handleSave(data)
            } catch (err) {
              setSaving(false)
              toast.error(err instanceof Error ? err.message : tSpec("failedSave"))
              throw err
            }
          }}
        />

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            form="specialist-edit-form"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("saveButton")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("deleteButton")}
          </Button>
        </div>
      </div>
    </div>
  )
}
