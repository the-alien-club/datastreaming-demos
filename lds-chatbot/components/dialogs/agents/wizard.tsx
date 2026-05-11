"use client"

import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StartWizard } from "@/components/wizards/agents/start/index"

interface DialogAgentWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
}

export function DialogAgentWizard({
  open,
  onOpenChange,
  onClose,
}: DialogAgentWizardProps) {
  const t = useTranslations("wizard")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        {open && <StartWizard onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
