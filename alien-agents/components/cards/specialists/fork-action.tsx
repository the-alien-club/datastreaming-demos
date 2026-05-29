"use client"

import { useTranslations } from "next-intl"
import { GitFork, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useForkSpecialist } from "@/hooks/api/specialists"

export function CardSpecialistForkAction({ specialistId }: { specialistId: string }) {
  const t = useTranslations("specialists.card")
  const { mutate: forkSpecialist, isPending } = useForkSpecialist()

  function handleFork() {
    forkSpecialist(
      { id: specialistId, nameSuffix: t("forkCopySuffix") },
      {
        onSuccess: (forked) => {
          toast.success(t("forked", { name: forked.name }))
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
