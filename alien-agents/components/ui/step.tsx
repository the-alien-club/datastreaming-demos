import { cn } from "@/lib/utils"
import React from "react"

export interface StepProps {
  /** Shown in the wizard step indicator and as the step title. */
  label: string
  /** Shown below the label in the indicator and as the step subtitle. */
  description?: string
  /**
     * Return false to disable the wizard's Next button while on this step,
     * consumed by `<Wizard>`, not rendered by `<Step>` itself.
     */
  canProceed?: () => boolean
  /**
     * Called when the user clicks Next (or Finish on the last step).
     * Return false to stay on the current step (e.g. on API error).
     * The wizard shows a loading spinner while this is running,
     * consumed by `<Wizard>`, not rendered by `<Step>` itself.
     */
  onBeforeNext?: () => Promise<boolean>
  children?: React.ReactNode
  className?: string
}

/**
 * A single step in a `<Wizard>`. Renders its own header (from `label` and
 * `description` props) followed by `children` as the step body.
 *
 * The `canProceed` and `onBeforeNext` props are consumed by `<Wizard>` and
 * never rendered here.
 */
function Step({ label, description, canProceed: _canProceed, onBeforeNext: _onBeforeNext, children, className }: StepProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} data-slot="step">
      <div className="flex flex-col gap-1" data-slot="step-header">
        <h2 className="text-base font-semibold leading-tight" data-slot="step-title">
          {label}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground" data-slot="step-description">
            {description}
          </p>
        )}
      </div>
      <div data-slot="step-content">{children}</div>
    </div>
  )
}

// Sub-components for advanced / custom layouts

function StepHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} data-slot="step-header" {...props} />
}

function StepTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold leading-tight", className)} data-slot="step-title" {...props} />
}

function StepDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} data-slot="step-description" {...props} />
}

function StepContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("", className)} data-slot="step-content" {...props} />
}

function StepFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2", className)} data-slot="step-footer" {...props} />
}

export { Step, StepHeader, StepTitle, StepDescription, StepContent, StepFooter }
