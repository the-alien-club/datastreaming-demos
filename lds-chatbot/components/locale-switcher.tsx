"use client"

import { useLocale } from "next-intl"
import { usePathname, useRouter } from "@/i18n/routing"
import { routing } from "@/i18n/routing"
import { cn } from "@/lib/utils"

export function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(next: (typeof routing.locales)[number]) {
    if (next === locale) return
    router.replace(pathname, { locale: next })
  }

  return (
    <div className="flex items-center rounded-md border border-sidebar-border overflow-hidden text-xs font-medium">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchLocale(loc)}
          className={cn(
            "px-2 py-1 uppercase transition-colors",
            loc === locale
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
          )}
        >
          {loc}
        </button>
      ))}
    </div>
  )
}
