"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, MessageSquare, Database, LogOut, BrainCircuit, Server } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

interface AppSidebarProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
}

const navigation = [
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Specialists", href: "/specialists", icon: BrainCircuit },
  { name: "Conversations", href: "/conversations", icon: MessageSquare },
  { name: "Datasets", href: "/datasets", icon: Database },
  { name: "MCP Servers", href: "/mcps", icon: Server },
]

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()

  const handleSignOut = async () => {
    await authClient.signOut()
    // window.location.href is a raw browser navigation that does NOT pass through
    // Next.js's basePath rewriting, so we have to prepend the basePath manually.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    window.location.href = `${basePath}/sign-in`
  }

  return (
    <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-4">
        <Link href="/agents" className="text-lg font-semibold">
          LDS Chatbot
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
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
