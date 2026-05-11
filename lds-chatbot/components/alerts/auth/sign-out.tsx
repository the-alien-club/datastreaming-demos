"use client"

import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
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

interface AlertDialogSignOutProps {
  onConfirm: () => void
}

export function AlertDialogSignOut({ onConfirm }: AlertDialogSignOutProps) {
  const t = useTranslations("nav")

  return (
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
          <AlertDialogAction onClick={onConfirm}>
            {t("signOutConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
