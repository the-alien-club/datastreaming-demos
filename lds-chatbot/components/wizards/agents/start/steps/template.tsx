"use client"

import { useTranslations } from "next-intl"
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
  const t = useTranslations("wizard")
  const selected = state.templateId

  function pick(template: WizardAgentTemplate) {
    setState((prev) => ({ ...prev, templateId: template.id }))
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("templateSubtitle")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {WIZARD_AGENT_TEMPLATES.filter((tpl) => !tpl.isBlank).map((template) => {
          const id = template.id
          return (
            <TemplateCard
              key={id}
              template={template}
              name={t(`tpl_${id}_name` as never)}
              description={t(`tpl_${id}_desc` as never)}
              capabilities={template.capabilities.map((_, i) =>
                t(`tpl_${id}_cap${i + 1}` as never)
              )}
              selected={selected === id}
              onSelect={() => pick(template)}
            />
          )
        })}
      </div>

      {WIZARD_AGENT_TEMPLATES.filter((tpl) => tpl.isBlank).map((template) => (
        <BlankCard
          key={template.id}
          template={template}
          name={t(`tpl_${template.id}_name` as never)}
          blankLabel={t("blankLabel")}
          blankDesc={t("blankSkipDesc")}
          selected={selected === template.id}
          onSelect={() => pick(template)}
        />
      ))}
    </div>
  )
}

function TemplateCard({
  template,
  name,
  description,
  capabilities,
  selected,
  onSelect,
}: {
  template: WizardAgentTemplate
  name: string
  description: string
  capabilities: string[]
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
        <div className="text-sm font-semibold">{name}</div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {capabilities.slice(0, 3).map((cap) => (
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
  name,
  blankLabel,
  blankDesc,
  selected,
  onSelect,
}: {
  template: WizardAgentTemplate
  name: string
  blankLabel: string
  blankDesc: string
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
          {name} {blankLabel}
        </span>
        <span className="text-xs text-muted-foreground">{blankDesc}</span>
      </div>
    </button>
  )
}

// Called from index.tsx when seeding the uploadDatasetName from the template.
export function suggestDatasetName(
  templateId: string,
  t: ReturnType<typeof useTranslations<"wizard">>,
): string {
  try {
    return t(`suggestedDataset_${templateId}` as never)
  } catch {
    return ""
  }
}
