"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/routing"
import { Bot, MessageSquare, Database, LogOut, BrainCircuit, Server, Sparkles } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { useWizardStart } from "@/components/wizards/agents/start/wizard-context"
import { LocaleSwitcher } from "@/components/locale-switcher"

interface AppSidebarProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
}

export function AppSidebar({ user }: AppSidebarProps) {
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
    // window.location.href is a raw browser navigation that does NOT pass through
    // Next.js's basePath rewriting, so we have to prepend the basePath manually.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    window.location.href = `${basePath}/sign-in`
  }

  return (
    <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/agents" className="flex flex-col gap-0.5">
          <img src="/lds-logo.png" alt="Legal DataSpace" className="h-7 w-auto" />
          <span className="text-[10px] italic text-muted-foreground leading-none">powered by Alien Intelligence</span>
        </Link>
        <LocaleSwitcher />
      </div>
      <Separator />
      <div className="px-3 py-3">
        <Button
          type="button"
          onClick={openWizard}
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
        <Button variant="ghost" size="icon" onClick={handleSignOut} className="shrink-0">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
