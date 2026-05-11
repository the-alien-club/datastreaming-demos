"use client"

import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

interface SheetMobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function SheetMobileNav({ open, onOpenChange, children }: SheetMobileNavProps) {
  const t = useTranslations("nav")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle>{t("navigation")}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  )
}
