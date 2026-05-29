import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  const t = useTranslations("common")
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-4">
      <h2 className="text-xl font-semibold">{t("pageNotFound")}</h2>
      <Button asChild>
        <Link href="/agents">{t("goToAgents")}</Link>
      </Button>
    </div>
  )
}
