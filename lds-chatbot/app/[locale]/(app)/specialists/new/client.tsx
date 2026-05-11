"use client"

import { useRouter, Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-fetch"
import {
  FormSpecialistCreate,
  type FormSpecialistCreateData,
  type McpOption,
} from "@/components/forms/specialists/create"
import type { PublicAIModel } from "@/lib/platform/client"
import { ROUTES } from "@/lib/constants"

type SpecialistNewClientProps = {
  initialModels: PublicAIModel[]
  initialMcps: McpOption[]
}

export function SpecialistNewClient({ initialModels, initialMcps }: SpecialistNewClientProps) {
  const t = useTranslations("specialists.form")
  const tSpec = useTranslations("specialists")
  const router = useRouter()

  const handleSubmit = async (data: FormSpecialistCreateData) => {
    const response = await apiFetch("/api/specialists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }))
      toast.error(err.error ?? `HTTP ${response.status}`)
      return
    }

    const specialist = await response.json()
    toast.success(tSpec("created2"))
    router.push(`${ROUTES.SPECIALISTS}/${specialist.id}`)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={ROUTES.SPECIALISTS}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      </div>

      <FormSpecialistCreate
        onSubmit={handleSubmit}
        models={initialModels}
        availableMcps={initialMcps}
      />
    </div>
  )
}
