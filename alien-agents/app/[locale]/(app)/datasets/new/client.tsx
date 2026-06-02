"use client"

import { useRouter, Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-fetch"
import {
  FormDatasetCreate,
  type FormDatasetCreatePayload,
} from "@/components/forms/datasets/create"
import { ROUTES } from "@/lib/constants"

export function DatasetNewClient() {
  const t = useTranslations("datasets.new")
  const router = useRouter()

  const handleSubmit = async (payload: FormDatasetCreatePayload) => {
    const createResponse = await apiFetch("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || undefined,
        aiInstructions: payload.aiInstructions || undefined,
      }),
    })

    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({ error: "Unknown error" }))
      toast.error(err.error ?? `HTTP ${createResponse.status}`)
      return
    }

    const dataset = await createResponse.json()
    const datasetId: string = dataset.id

    // Upload each file sequentially so the user gets per-file feedback from
    // the form component's internal status state (it tracks uploading/done/error).
    const uploadErrors: string[] = []
    for (const file of payload.files) {
      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await apiFetch(`/api/datasets/${datasetId}/entries`, {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.json().catch(() => ({ error: "Upload failed" }))
        uploadErrors.push(`${file.name}: ${errBody.error ?? `HTTP ${uploadResponse.status}`}`)
      }
    }

    if (uploadErrors.length > 0) {
      // Partial success — some files failed. Toast each error so the user can
      // see which files need to be re-uploaded on the dataset detail page.
      for (const msg of uploadErrors) {
        toast.error(msg)
      }
    } else {
      toast.success(t("created"))
    }

    // Navigate to the dataset detail page regardless — the dataset was created
    // and any successful uploads are already there.
    router.push(`${ROUTES.DATASETS}/${datasetId}`)
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={ROUTES.DATASETS}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <FormDatasetCreate onSubmit={handleSubmit} />
    </div>
  )
}
