import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Globe, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Single source of truth for "is this resource public or private" visual state.
 * Always renders — never conditional on isPublic — so privacy is immediately
 * legible across every card type (agents, specialists, datasets, mcps).
 *
 * Works in both server and client components: `useTranslations` from
 * `next-intl` is universal.
 */
export function PrivacyBadge({
  isPublic,
  size = "sm",
  className,
}: {
  isPublic: boolean
  size?: "xs" | "sm"
  className?: string
}) {
  const t = useTranslations("common.privacy")
  const sizeClasses =
    size === "xs"
      ? "text-[10px] gap-1 px-1.5 py-0"
      : "text-xs gap-1 px-2 py-0.5"
  const iconSize = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"

  if (isPublic) {
    return (
      <Badge
        className={cn(
          "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 font-medium",
          sizeClasses,
          className,
        )}
      >
        <Globe className={iconSize} />
        {t("public")}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-muted-foreground font-medium",
        sizeClasses,
        className,
      )}
    >
      <Lock className={iconSize} />
      {t("private")}
    </Badge>
  )
}
