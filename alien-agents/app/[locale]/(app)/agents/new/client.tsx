"use client"

import { useRouter, Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-fetch"
import { FormAgentCreate, type FormAgentCreateData } from "@/components/forms/agents/create"
import type { PublicAIModel } from "@/lib/platform/client"
import { ROUTES } from "@/lib/constants"

type AgentNewClientProps = {
  initialModels: PublicAIModel[]
}

export function AgentNewClient({ initialModels }: AgentNewClientProps) {
  const t = useTranslations("agents.form")
  const router = useRouter()

  const handleSubmit = async (data: FormAgentCreateData) => {
    const response = await apiFetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }))
      toast.error(err.error ?? `HTTP ${response.status}`)
      return
    }

    const agent = await response.json()
    toast.success(t("agentCreated"))
    router.push(`${ROUTES.AGENTS}/${agent.id}`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={ROUTES.AGENTS}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      </div>

      <FormAgentCreate onSubmit={handleSubmit} models={initialModels} />
    </div>
  )
}
