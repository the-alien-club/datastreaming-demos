"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import {
  Bot,
  MessageSquare,
  Database,
  LogOut,
  BrainCircuit,
  Sparkles,
  Menu,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useWizardStart } from "@/components/wizards/agents/start/wizard-context"
import { LocaleSwitcher } from "@/components/locale-switcher"

interface AppSidebarProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
  isOrgClient?: boolean
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
  clientVisible: boolean
  subItems?: NavSubItem[]
}

function SidebarContent({
  user,
  isOrgClient,
  onNavigate,
}: {
  user: AppSidebarProps["user"]
  isOrgClient?: boolean
  onNavigate?: () => void
}) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const { openWizard } = useWizardStart()

  const allNavigation: NavItem[] = [
    {
      name: t("agents"),
      href: "/agents",
      icon: Bot,
      clientVisible: true,
      subItems: [
        { name: t("myAgents"), href: "/agents", icon: Settings },
        { name: t("agentLibrary"), href: "/agents/library", icon: Book },
      ],
    },
    {
      name: t("conversations"),
      href: "/conversations",
      icon: MessageSquare,
      clientVisible: true,
    },
    {
      name: t("specialists"),
      href: "/specialists",
      icon: BrainCircuit,
      clientVisible: false,
      subItems: [
        { name: t("mySpecialists"), href: "/specialists", icon: Settings },
        { name: t("specialistsLibrary"), href: "/specialists/library", icon: Book },
      ],
    },
    {
      name: t("corpus"),
      href: "/datasets",
      icon: FileText,
      clientVisible: false,
      subItems: [
        { name: t("myCorpus"), href: "/datasets", icon: FolderOpen },
        { name: t("corpusLibrary"), href: "/datasets/library", icon: Book },
      ],
    },
    {
      name: t("databases"),
      href: "/mcps",
      icon: Database,
      clientVisible: false,
      subItems: [
        { name: t("myDatabases"), href: "/mcps", icon: Settings },
        { name: t("databasesLibrary"), href: "/mcps/library", icon: Book },
      ],
    },
  ]

  const navigation = isOrgClient
    ? allNavigation.filter((item) => item.clientVisible)
    : allNavigation

  const getInitialExpanded = () => {
    for (const item of navigation) {
      if (
        item.subItems &&
        (pathname === item.href || pathname.startsWith(item.href + "/"))
      ) {
        return item.href
      }
    }
    return null
  }

  const [expandedItem, setExpandedItem] = useState<string | null>(
    getInitialExpanded
  )

  useEffect(() => {
    if (pathname === "/agents" || pathname.startsWith("/agents/")) {
      setExpandedItem("/agents")
    } else if (pathname === "/datasets" || pathname.startsWith("/datasets/")) {
      setExpandedItem("/datasets")
    } else if (pathname === "/mcps" || pathname.startsWith("/mcps/")) {
      setExpandedItem("/mcps")
    } else if (pathname === "/specialists" || pathname.startsWith("/specialists/")) {
      setExpandedItem("/specialists")
    }
  }, [pathname])

  const handleSignOut = async () => {
    await authClient.signOut()
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    window.location.href = `${basePath}/sign-in`
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/agents" className="flex flex-col gap-0.5" onClick={onNavigate}>
          <img
            src="https://www.legaldataspace.eu/images/LOGO-LDS-BLACK.svg"
            alt="Legal DataSpace"
            className="h-7 w-auto"
          />
          <span className="text-[10px] italic text-muted-foreground leading-none">
            powered by Alien Intelligence
          </span>
        </Link>
        <LocaleSwitcher />
      </div>

      {!isOrgClient && (
        <>
          <Separator />
          <div className="px-3 py-3">
            <Button
              type="button"
              onClick={() => {
                openWizard()
                onNavigate?.()
              }}
              className="w-full justify-start gap-2 bg-linear-to-r from-primary to-primary/80 text-primary-foreground shadow ring-1 ring-primary/30 hover:from-primary/90 hover:to-primary/70"
            >
              <Sparkles className="h-4 w-4" />
              {t("start")}
            </Button>
          </div>
        </>
      )}

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
                  href={item.href as any}
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
                        href={sub.href as any}
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("signOut")}
              className="shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("signOutTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("signOutDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("signOutCancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>
                {t("signOutConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export function AppSidebar({ user, isOrgClient }: AppSidebarProps) {
  const [open, setOpen] = useState(false)
  const t = useTranslations("nav")

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <SidebarContent user={user} isOrgClient={isOrgClient} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle>{t("navigation")}</SheetTitle>
            <SidebarContent
              user={user}
              isOrgClient={isOrgClient}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <Link href="/agents">
          <img
            src="https://www.legaldataspace.eu/images/LOGO-LDS-BLACK.svg"
            alt="Legal DataSpace"
            className="h-6 w-auto"
          />
        </Link>

        <LocaleSwitcher />
      </div>
    </>
  )
}
