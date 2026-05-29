import { defineRouting } from "next-intl/routing"
import { createNavigation } from "next-intl/navigation"

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // FR (default) has no URL prefix; EN gets /en/ prefix.
  localePrefix: "as-needed",
})

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)
