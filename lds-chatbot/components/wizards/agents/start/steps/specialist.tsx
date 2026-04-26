"use client"

import { useState } from "react"
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
  const [promptOpen, setPromptOpen] = useState(false)

  function pick(template: WizardSpecialistTemplate) {
    setState((prev) => ({
      ...prev,
      specialistTemplateId: template.id,
      specialistName: template.isCustom
        ? prev.specialistName
        : (prev.specialistName && prev.specialistTemplateId === template.id
            ? prev.specialistName
            : template.name),
      specialistSystemPrompt: template.systemPrompt,
    }))
  }

  const trimmedName = state.specialistName.trim()
  const selectedTemplate = WIZARD_SPECIALIST_TEMPLATES.find(
    (t) => t.id === state.specialistTemplateId,
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {WIZARD_SPECIALIST_TEMPLATES.map((template) => (
          <SpecialistCard
            key={template.id}
            template={template}
            selected={state.specialistTemplateId === template.id}
            onSelect={() => pick(template)}
          />
        ))}
      </div>

      {selectedTemplate && (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-specialist-name">Specialist name</Label>
            <Input
              id="wizard-specialist-name"
              value={state.specialistName}
              onChange={(e) =>
                setState((prev) => ({ ...prev, specialistName: e.target.value }))
              }
              placeholder={selectedTemplate.isCustom ? "e.g. M&A Clause Writer" : selectedTemplate.name}
            />
            {trimmedName.length > 0 && trimmedName.length < 3 && (
              <p className="text-xs text-destructive">Name must be at least 3 characters.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {promptOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            Edit prompt
          </button>

          {promptOpen && (
            <div className="space-y-2">
              <Label htmlFor="wizard-specialist-prompt">System prompt</Label>
              <Textarea
                id="wizard-specialist-prompt"
                value={state.specialistSystemPrompt}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, specialistSystemPrompt: e.target.value }))
                }
                className="min-h-28 resize-y text-xs"
                placeholder={
                  selectedTemplate.isCustom
                    ? "Describe the role and behaviour of this specialist."
                    : ""
                }
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
  selected,
  onSelect,
}: {
  template: WizardSpecialistTemplate
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
        <span className="text-sm font-semibold">{template.name}</span>
      </div>
      <p className="text-xs text-muted-foreground">{template.description}</p>
    </button>
  )
}
