"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  WIZARD_SPECIALIST_TEMPLATES,
  type WizardSpecialistTemplate,
} from "../templates"
import type { WizardSetState, WizardState } from "../state"

interface SpecialistStepContentProps {
  state: WizardState
  setState: WizardSetState
}

export function SpecialistStepContent({ state, setState }: SpecialistStepContentProps) {
  const t = useTranslations("wizard.steps.specialist")
  const tWizard = useTranslations("wizard")
  const [promptOpen, setPromptOpen] = useState(false)

  function pick(template: WizardSpecialistTemplate) {
    const translatedName = template.isCustom ? "" : tWizard(`sp_${template.id}_name` as never)
    const translatedPrompt = tWizard(`sp_${template.id}_prompt` as never)
    setState((prev) => ({
      ...prev,
      specialistTemplateId: template.id,
      specialistName: template.isCustom
        ? ""
        : (prev.specialistName && prev.specialistTemplateId === template.id
            ? prev.specialistName
            : translatedName),
      specialistSystemPrompt: translatedPrompt,
    }))
  }

  const trimmedName = state.specialistName.trim()
  const selectedTemplate = WIZARD_SPECIALIST_TEMPLATES.find(
    (tpl) => tpl.id === state.specialistTemplateId,
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {WIZARD_SPECIALIST_TEMPLATES.map((template) => (
          <SpecialistCard
            key={template.id}
            template={template}
            name={tWizard(`sp_${template.id}_name` as never)}
            description={tWizard(`sp_${template.id}_desc` as never)}
            selected={state.specialistTemplateId === template.id}
            onSelect={() => pick(template)}
          />
        ))}
      </div>

      {selectedTemplate && (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-specialist-name">{t("specialistNameLabel")}</Label>
            <Input
              id="wizard-specialist-name"
              value={state.specialistName}
              onChange={(e) =>
                setState((prev) => ({ ...prev, specialistName: e.target.value }))
              }
              placeholder={
                selectedTemplate.isCustom
                  ? tWizard("sp_custom_name" as never)
                  : tWizard(`sp_${selectedTemplate.id}_name` as never)
              }
            />
            {trimmedName.length > 0 && trimmedName.length < 3 && (
              <p className="text-xs text-destructive">{t("specialistNameMinLength")}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {promptOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {t("editPrompt")}
          </button>

          {promptOpen && (
            <div className="space-y-2">
              <Label htmlFor="wizard-specialist-prompt">{t("specialistPromptLabel")}</Label>
              <Textarea
                id="wizard-specialist-prompt"
                value={state.specialistSystemPrompt}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, specialistSystemPrompt: e.target.value }))
                }
                className="min-h-28 resize-y text-xs"
                placeholder={selectedTemplate.isCustom ? t("customPromptPlaceholder") : ""}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SpecialistCard({
  template,
  name,
  description,
  selected,
  onSelect,
}: {
  template: WizardSpecialistTemplate
  name: string
  description: string
  selected: boolean
  onSelect: () => void
}) {
  const Icon = template.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent/30",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-md",
            selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <span className="text-sm font-semibold">{name}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  )
}
