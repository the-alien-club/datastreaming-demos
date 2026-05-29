"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { GitFork, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useForkAgent } from "@/hooks/api/agents"

export function CardAgentForkAction({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.card")
  const router = useRouter()
  const { mutate: forkAgent, isPending } = useForkAgent()

  function handleFork() {
    forkAgent(
      { id: agentId, nameSuffix: t("forkCopySuffix") },
      {
        onSuccess: (forked) => {
          toast.success(t("forked", { name: forked.name }))
          router.push(`/agents/${forked.id}/chat`)
        },
        onError: (err) => {
          toast.error(err.message || t("forkFailed"))
        },
      },
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="flex-1"
      disabled={isPending}
      onClick={handleFork}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <GitFork className="h-3.5 w-3.5 mr-1.5" />
      )}
      {t("fork")}
    </Button>
  )
}
