"use client"

import { Button } from "@/components/ui/button"
import type { StepProps } from "@/components/ui/step"
import { WizardSteps } from "@/components/ui/wizard-steps"
import { ChevronLeftIcon, ChevronRightIcon, Loader2 } from "lucide-react"
import React, { useState } from "react"

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
    /** Called after advancing to the last step's completion (no API call here). */
    onCancel?: () => void
    cancelLabel?: string
    submitLabel?: string
}

export function Wizard({ children, onCancel, cancelLabel = "Cancel", submitLabel = "Finish" }: WizardProps) {
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
                        Back
                    </Button>
                )}

                <Button type="button" onClick={handleNext} disabled={!canProceed}>
                    {isLoading ? (
                        <>
                            <Loader2 className="size-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : isLast ? (
                        submitLabel
                    ) : (
                        <>
                            Next
                            <ChevronRightIcon className="size-4 ml-1" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
