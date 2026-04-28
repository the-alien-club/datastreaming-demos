"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  type PublicAIModel,
  providerLabelFromModel,
} from "@/lib/platform/client"
import type { WizardSetState, WizardState } from "../state"

interface IdentityStepContentProps {
  state: WizardState
  setState: WizardSetState
  models: PublicAIModel[]
}

export function IdentityStepContent({ state, setState, models }: IdentityStepContentProps) {
  const t = useTranslations("wizard")
  const tCommon = useTranslations("common")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const trimmedName = state.name.trim()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wizard-agent-name">{tCommon("nameLabel")}</Label>
        <Input
          id="wizard-agent-name"
          value={state.name}
          onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t("namePlaceholder")}
          autoFocus
        />
        {trimmedName.length > 0 && trimmedName.length < 3 && (
          <p className="text-xs text-destructive">{t("nameMinLength")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-agent-description">{t("descriptionLabel")}</Label>
        <Input
          id="wizard-agent-description"
          value={state.description}
          onChange={(e) => setState((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {advancedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {t("advanced")}
      </button>

      {advancedOpen && (
        <div className="space-y-4 rounded-md border bg-muted/30 p-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-agent-system-prompt">{t("systemPromptLabel")}</Label>
            <Textarea
              id="wizard-agent-system-prompt"
              value={state.systemPrompt}
              onChange={(e) => setState((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              className="min-h-32 resize-y text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wizard-agent-model">{t("modelLabel")}</Label>
            {models.length === 0 ? (
              <Input
                id="wizard-agent-model"
                value={state.model}
                onChange={(e) => setState((prev) => ({ ...prev, model: e.target.value }))}
              />
            ) : (
              <Select
                value={state.model}
                onValueChange={(v) => setState((prev) => ({ ...prev, model: v }))}
              >
                <SelectTrigger id="wizard-agent-model" className="w-full">
                  <SelectValue placeholder={tCommon("selectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.slug}>
                      <span>{m.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {providerLabelFromModel(m)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      {state.agentId && (
        <p className="text-xs text-muted-foreground">{t("agentSavedNote")}</p>
      )}
    </div>
  )
}
