"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StartWizard } from "./index"

interface WizardStartContextValue {
  open: boolean
  openWizard: () => void
  closeWizard: () => void
}

const WizardStartContext = createContext<WizardStartContextValue | null>(null)

const SEEN_STORAGE_KEY = "lds-chatbot:start-wizard-seen"

export function WizardStartProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const t = useTranslations("wizard")

  const openWizard = useCallback(() => setOpen(true), [])
  const closeWizard = useCallback(() => setOpen(false), [])

  return (
    <WizardStartContext.Provider value={{ open, openWizard, closeWizard }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          {open && <StartWizard onClose={closeWizard} />}
        </DialogContent>
      </Dialog>
    </WizardStartContext.Provider>
  )
}

export function useWizardStart(): WizardStartContextValue {
  const ctx = useContext(WizardStartContext)
  if (!ctx) {
    throw new Error("useWizardStart must be used inside <WizardStartProvider>")
  }
  return ctx
}

export function AutoOpenIfEmpty({ agentCount }: { agentCount: number }) {
  const { openWizard } = useWizardStart()

  useEffect(() => {
    if (agentCount > 0) return
    if (typeof window === "undefined") return
    if (window.localStorage.getItem(SEEN_STORAGE_KEY) !== null) return
    window.localStorage.setItem(SEEN_STORAGE_KEY, "true")
    openWizard()
  }, [agentCount, openWizard])

  return null
}

export function markWizardSeen() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SEEN_STORAGE_KEY, "true")
}
