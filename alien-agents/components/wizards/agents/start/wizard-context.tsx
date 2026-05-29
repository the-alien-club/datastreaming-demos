"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { DialogAgentWizard } from "@/components/dialogs/agents/wizard"

interface WizardStartContextValue {
  open: boolean
  openWizard: () => void
  closeWizard: () => void
}

const WizardStartContext = createContext<WizardStartContextValue | null>(null)

const SEEN_STORAGE_KEY = "lds-chatbot:start-wizard-seen"

export function WizardStartProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  const openWizard = useCallback(() => setOpen(true), [])
  const closeWizard = useCallback(() => setOpen(false), [])

  return (
    <WizardStartContext.Provider value={{ open, openWizard, closeWizard }}>
      {children}
      <DialogAgentWizard open={open} onOpenChange={setOpen} onClose={closeWizard} />
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
