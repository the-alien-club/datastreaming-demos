"use client"

import { cn } from "@/lib/utils"
import {
  WIZARD_AGENT_TEMPLATES,
  type WizardAgentTemplate,
} from "../templates"
import type { WizardSetState, WizardState } from "../state"

interface TemplateStepContentProps {
  state: WizardState
  setState: WizardSetState
}

export function TemplateStepContent({ state, setState }: TemplateStepContentProps) {
  const selected = state.templateId

  function pick(template: WizardAgentTemplate) {
    setState((prev) => ({ ...prev, templateId: template.id }))
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        An AI agent for your legal team — pick a starting point or build from scratch.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {WIZARD_AGENT_TEMPLATES.filter((t) => !t.isBlank).map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={selected === template.id}
            onSelect={() => pick(template)}
          />
        ))}
      </div>

      {WIZARD_AGENT_TEMPLATES.filter((t) => t.isBlank).map((template) => (
        <BlankCard
          key={template.id}
          template={template}
          selected={selected === template.id}
          onSelect={() => pick(template)}
        />
      ))}
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: WizardAgentTemplate
  selected: boolean
  onSelect: () => void
}) {
  const Icon = template.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col gap-2 text-left rounded-lg border p-4 transition-colors hover:bg-accent/30",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-md",
            selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="text-sm font-semibold">{template.name}</div>
      </div>
      <p className="text-xs text-muted-foreground">{template.description}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {template.capabilities.slice(0, 3).map((cap) => (
          <li key={cap} className="flex gap-1.5">
            <span className="text-primary/80">·</span>
            <span>{cap}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}

function BlankCard({
  template,
  selected,
  onSelect,
}: {
  template: WizardAgentTemplate
  selected: boolean
  onSelect: () => void
}) {
  const Icon = template.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-accent/30",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border bg-muted/30",
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-muted-foreground">
          {template.name} — start from scratch
        </span>
        <span className="text-xs text-muted-foreground">
          Skip the templates and configure everything yourself.
        </span>
      </div>
    </button>
  )
}

export function suggestDatasetName(template: WizardAgentTemplate): string {
  switch (template.id) {
    case "contract-drafter":
      return "Firm contract archive"
    case "jurisprudence-researcher":
      return "Case law archive"
    case "compliance-advisor":
      return "Internal policies"
    case "legal-qa":
      return "Knowledge base"
    default:
      return ""
  }
}
