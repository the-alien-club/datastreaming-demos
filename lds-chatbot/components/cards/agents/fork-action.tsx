"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { GitFork, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-fetch"
import type { ForkAgentResponse } from "@/app/api/_validators"

export function CardAgentForkAction({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.card")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function handleFork() {
    setPending(true)
    try {
      const res = await apiFetch(`/api/agents/${agentId}/fork`, { method: "POST" })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const forked = (await res.json()) as ForkAgentResponse
      toast.success(t("forked", { name: forked.name }))
      router.push(`/agents/${forked.id}/chat`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("forkFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="flex-1"
      disabled={pending}
      onClick={handleFork}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <GitFork className="h-3.5 w-3.5 mr-1.5" />
      )}
      {t("fork")}
    </Button>
  )
}
