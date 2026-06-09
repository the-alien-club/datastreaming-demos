"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import {
  Bot,
  MessageSquare,
  Database,
  BrainCircuit,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Book,
  FolderOpen,
  Settings,
  FileText,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { AlertDialogSignOut } from "@/components/alerts/auth/sign-out"
import { SheetMobileNav } from "@/components/sheets/navigation/mobile"

interface AppSidebarProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
}

type NavSubItem = {
  name: string
  href: string
  icon: React.ElementType
}

type NavItem = {
  name: string
  href: string
  icon: React.ElementType
  subItems?: NavSubItem[]
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: AppSidebarProps["user"]
  onNavigate?: () => void
}) {
  const t = useTranslations("nav")
  const pathname = usePathname()

  const navigation: NavItem[] = useMemo(
    () => [
      {
        name: t("agents"),
        href: "/agents",
        icon: Bot,
        subItems: [
          { name: t("myAgents"), href: "/agents", icon: Settings },
          { name: t("agentLibrary"), href: "/agents/library", icon: Book },
        ],
      },
      {
        name: t("conversations"),
        href: "/conversations",
        icon: MessageSquare,
      },
      {
        name: t("specialists"),
        href: "/specialists",
        icon: BrainCircuit,
        subItems: [
          { name: t("mySpecialists"), href: "/specialists", icon: Settings },
          { name: t("specialistsLibrary"), href: "/specialists/library", icon: Book },
        ],
      },
      {
        name: t("corpus"),
        href: "/datasets",
        icon: FileText,
        subItems: [
          { name: t("myCorpus"), href: "/datasets", icon: FolderOpen },
          { name: t("corpusLibrary"), href: "/datasets/library", icon: Book },
        ],
      },
      {
        name: t("databases"),
        href: "/mcps",
        icon: Database,
        subItems: [
          { name: t("myDatabases"), href: "/mcps", icon: Settings },
          { name: t("databasesLibrary"), href: "/mcps/library", icon: Book },
        ],
      },
    ],
    [t],
  )

  // Derive which nav group should be expanded from the current pathname.
  // This is pure derivation — no effect or setState needed.
  const pathnameExpanded = useMemo<string | null>(() => {
    for (const item of navigation) {
      if (
        item.subItems &&
        (pathname === item.href || pathname.startsWith(item.href + "/"))
      ) {
        return item.href
      }
    }
    return null
  }, [navigation, pathname])

  // `manualToggle` records an explicit user collapse/expand relative to the
  // current pathname. It stores `[triggeredForPathname, overrideValue]` so
  // that navigating to a new route clears the override automatically.
  const [manualToggle, setManualToggle] = useState<[string | null, string | null] | null>(null)

  // If the user toggled while on the same pathname-derived group, honour their
  // choice; otherwise fall back to the pathname-derived value.
  const expandedItem =
    manualToggle !== null && manualToggle[0] === pathnameExpanded
      ? manualToggle[1]
      : pathnameExpanded

  const setExpandedItem = (value: string | null) => {
    setManualToggle([pathnameExpanded, value])
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    window.location.href = `${basePath}/sign-in`
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/agents" className="flex items-center" onClick={onNavigate}>
          {/* Plain <img>: the SVG's intrinsic dims don't match what Next/Image
              expects, so even with `unoptimized` it can render at zero size.
              Frontend repo uses the same pattern. basePath must be prepended
              manually — <img> does not get the auto-prefix that next/image
              and <Link> provide. */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/images/logo-w.svg`}
            alt="Alien"
            className="h-7 w-auto"
          />
        </Link>
        <LocaleSwitcher />
      </div>

      <Separator />
      <div className="px-3 py-3">
        <Button
          asChild
          className="w-full justify-start gap-2 bg-linear-to-r from-primary to-primary/80 text-primary-foreground shadow ring-1 ring-primary/30 hover:from-primary/90 hover:to-primary/70"
        >
          <Link href="/agents/new" onClick={onNavigate}>
            <Sparkles className="h-4 w-4" />
            {t("start")}
          </Link>
        </Button>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const hasSubItems = !!item.subItems?.length
          const isExpanded = expandedItem === item.href
          const isParentActive =
            pathname === item.href || pathname.startsWith(item.href + "/")

          return (
            <div key={item.href}>
              {hasSubItems ? (
                <button
                  onClick={() =>
                    setExpandedItem(isExpanded ? null : item.href)
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isParentActive
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </button>
              ) : (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isParentActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )}

              {hasSubItems && isExpanded && (() => {
                // Longest-prefix match: pick the most specific sub-item href that matches.
                const activeSubHref = item.subItems!
                  .filter((s) => pathname === s.href || pathname.startsWith(s.href + "/"))
                  .sort((a, b) => b.href.length - a.href.length)[0]?.href

                return (
                <div className="mt-1 ml-4 space-y-0.5">
                  {item.subItems!.map((sub) => {
                    const isSubActive = sub.href === activeSubHref

                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isSubActive
                            ? "border-l-2 border-primary bg-primary/5 font-medium text-primary"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                        )}
                      >
                        <sub.icon className="h-4 w-4" />
                        {sub.name}
                      </Link>
                    )
                  })}
                </div>
                )
              })()}
            </div>
          )
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {user.name?.slice(0, 2).toUpperCase() || "??"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <AlertDialogSignOut onConfirm={handleSignOut} />
      </div>
    </div>
  )
}

export function AppSidebar({ user }: AppSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
        <SheetMobileNav open={open} onOpenChange={setOpen}>
          <SidebarContent
            user={user}
            onNavigate={() => setOpen(false)}
          />
        </SheetMobileNav>

        <Link href="/agents">
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/images/logo-w.svg`}
            alt="Alien"
            className="h-6 w-auto"
          />
        </Link>

        <LocaleSwitcher />
      </div>
    </>
  )
}
