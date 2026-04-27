import { cn } from "@/lib/utils"
import { wizardStepCircleIndicatorClass, wizardStepConnectorClass } from "@/lib/utils/wizard-styling"
import { CheckIcon } from "lucide-react"

interface WizardStep {
  label: string
  description?: string
}

interface WizardStepsProps {
  steps: WizardStep[]
  currentStep: number
  className?: string
}

export function WizardSteps({ steps, currentStep, className }: WizardStepsProps) {
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
