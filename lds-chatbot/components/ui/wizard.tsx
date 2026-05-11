"use client"

import { Button } from "@/components/ui/button"
import type { StepProps } from "@/components/ui/step"
import { cn } from "@/lib/utils"
import { wizardStepCircleIndicatorClass, wizardStepConnectorClass } from "@/lib/utils/wizard-styling"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2 } from "lucide-react"
import React, { useState } from "react"

// ---------------------------------------------------------------------------
// WizardSteps — private sub-component, not exported as a standalone primitive
// ---------------------------------------------------------------------------

interface WizardStep {
  label: string
  description?: string
}

interface WizardStepsProps {
  steps: WizardStep[]
  currentStep: number
  className?: string
}

function WizardSteps({ steps, currentStep, className }: WizardStepsProps) {
  return (
    <div className={cn("flex items-start gap-0 w-full", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isFirst = index === 0
        const isLast = index === steps.length - 1
        const labelClass = isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"

        return (
          <div key={`${index}-${step.label}`} className="flex items-start flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div className="flex items-center w-full">
                <div className={wizardStepConnectorClass(isFirst, false, isCompleted)} />

                <div
                  className={cn(
                    "flex items-center justify-center size-8 rounded-full border-2 shrink-0 transition-colors text-sm font-semibold",
                    wizardStepCircleIndicatorClass(isCompleted, isCurrent),
                  )}
                >
                  {isCompleted ? <CheckIcon className="size-4" strokeWidth={2.5} /> : index + 1}
                </div>

                <div className={wizardStepConnectorClass(false, isLast, isCompleted)} />
              </div>

              <div className="flex flex-col items-center text-center px-1">
                <span className={cn("text-xs font-medium leading-tight", labelClass)}>{step.label}</span>
                {step.description && (
                  <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{step.description}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface WizardProps {
  /**
     * Each direct child must be a `<Step>` element. The wizard reads each
     * child's `label`, `description`, `canProceed`, and `onBeforeNext` props
     * automatically.
     *
     * `onBeforeNext` on each step is called when the user clicks Next (or
     * Finish on the last step). Return false to stay on the current step.
     */
  children: React.ReactNode
  onCancel?: () => void
  cancelLabel?: string
  submitLabel?: string
  backLabel?: string
  nextLabel?: string
  savingLabel?: string
}

export function Wizard({
  children,
  onCancel,
  cancelLabel = "Cancel",
  submitLabel = "Finish",
  backLabel = "Back",
  nextLabel = "Next",
  savingLabel = "Saving...",
}: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const steps = React.Children.toArray(children).filter((child): child is React.ReactElement<StepProps> => React.isValidElement(child))

  const total = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === total - 1
  const current = steps[currentStep]

  // canProceed is a live closure - re-evaluated on every render
  const canProceed = (current?.props.canProceed?.() ?? true) && !isLoading

  const stepDefs = steps.map(s => ({ label: s.props.label, description: s.props.description }))

  async function handleNext() {
    const onBeforeNext = current?.props.onBeforeNext
    if (onBeforeNext) {
      setIsLoading(true)
      try {
        const ok = await onBeforeNext()
        if (!ok) return
      } finally {
        setIsLoading(false)
      }
    }
    setCurrentStep(s => s + 1)
  }

  function handleBack() {
    if (!isLoading) setCurrentStep(s => s - 1)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <WizardSteps steps={stepDefs} currentStep={currentStep} />

      {/* Active step */}
      <div className="min-h-80">{current}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        {isFirst ? (
          onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              {cancelLabel}
            </Button>
          ) : (
            <div />
          )
        ) : (
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            <ChevronLeftIcon className="size-4 mr-1" />
            {backLabel}
          </Button>
        )}

        <Button type="button" onClick={handleNext} disabled={!canProceed}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {savingLabel}
            </>
          ) : isLast ? (
            submitLabel
          ) : (
            <>
              {nextLabel}
              <ChevronRightIcon className="size-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
