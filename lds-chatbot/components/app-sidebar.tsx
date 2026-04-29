"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { Bot, MessageSquare, Database, LogOut, BrainCircuit, Server, Sparkles, Menu } from "lucide-react"
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
}

// The inner navigation content, shared between the persistent sidebar and the mobile sheet.
function SidebarContent({
  user,
  onNavigate,
}: {
  user: AppSidebarProps["user"]
  onNavigate?: () => void
}) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const { openWizard } = useWizardStart()

  const navigation = [
    { name: t("agents"), href: "/agents" as const, icon: Bot },
    { name: t("specialists"), href: "/specialists" as const, icon: BrainCircuit },
    { name: t("conversations"), href: "/conversations" as const, icon: MessageSquare },
    { name: t("datasets"), href: "/datasets" as const, icon: Database },
    { name: t("mcpServers"), href: "/mcps" as const, icon: Server },
  ]

  const handleSignOut = async () => {
    await authClient.signOut()
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    window.location.href = `${basePath}/sign-in`
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/agents" className="flex flex-col gap-0.5" onClick={onNavigate}>
          <img src="/lds-logo.png" alt="Legal DataSpace" className="h-7 w-auto" />
          <span className="text-[10px] italic text-muted-foreground leading-none">powered by Alien Intelligence</span>
        </Link>
        <LocaleSwitcher />
      </div>
      <Separator />
      <div className="px-3 py-3">
        <Button
          type="button"
          onClick={() => { openWizard(); onNavigate?.() }}
          className="w-full justify-start gap-2 bg-linear-to-r from-primary to-primary/80 text-primary-foreground shadow ring-1 ring-primary/30 hover:from-primary/90 hover:to-primary/70"
        >
          <Sparkles className="h-4 w-4" />
          {t("start")}
        </Button>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
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
              <AlertDialogDescription>{t("signOutDescription")}</AlertDialogDescription>
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

export function AppSidebar({ user }: AppSidebarProps) {
  const [open, setOpen] = useState(false)
  const t = useTranslations("nav")

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile top bar with hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle>{t("navigation")}</SheetTitle>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link href="/agents">
          <img src="/lds-logo.png" alt="Legal DataSpace" className="h-6 w-auto" />
        </Link>

        <LocaleSwitcher />
      </div>
    </>
  )
}
