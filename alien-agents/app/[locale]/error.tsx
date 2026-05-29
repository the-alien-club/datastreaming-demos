"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common")
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-4">
      <h2 className="text-xl font-semibold">{t("error")}</h2>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <Button onClick={reset}>{t("tryAgain")}</Button>
    </div>
  )
}
