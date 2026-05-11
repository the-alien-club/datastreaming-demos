"use client"

import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AlertDialogDeleteConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceLabel: string
  name: string
  onConfirm: (e: React.MouseEvent) => void
  deleting?: boolean
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

export function AlertDialogDeleteConfirm({
  open,
  onOpenChange,
  resourceLabel,
  name,
  onConfirm,
  deleting = false,
  onClick,
}: AlertDialogDeleteConfirmProps) {
  const t = useTranslations("common.delete")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={onClick}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dialogTitle", { resource: resourceLabel })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialogDescription", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
