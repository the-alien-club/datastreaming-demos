import { cn } from "@/lib/utils"

/**
 * Build the Tailwind CSS class string for a wizard step connector line.
 * The first and last connectors are rendered invisibly to keep spacing symmetric.
 * @param isFirst Whether this connector is the leading edge of the first step.
 * @param isLast Whether this connector is the trailing edge of the last step.
 * @param isCompleted Whether the step this connector belongs to has been completed.
 * @returns Tailwind class string for the connector element.
 */
export function wizardStepConnectorClass(isFirst: boolean, isLast: boolean, isCompleted: boolean): string {
  if (isFirst || isLast) return "flex-1 h-px invisible"
  return cn("flex-1 h-px", isCompleted ? "bg-primary" : "bg-border")
}

/**
 * Build the Tailwind CSS class string for a wizard step circle indicator.
 * @param isCompleted Whether the step has been completed.
 * @param isCurrent Whether the step is the currently active step.
 * @returns Tailwind class string for the circle element.
 */
export function wizardStepCircleIndicatorClass(isCompleted: boolean, isCurrent: boolean): string {
  if (isCompleted) return "bg-primary border-primary text-primary-foreground"
  if (isCurrent) return "border-primary text-primary bg-background"
  return "border-border text-muted-foreground bg-background"
}
