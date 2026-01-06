import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        destructive: "bg-destructive/10 text-destructive border-transparent dark:bg-destructive/20",
        muted: "bg-muted text-muted-foreground border-transparent",
        outline: "bg-background text-foreground border",
        primary: "bg-primary text-primary-foreground border-transparent",
        success: "bg-green-100 text-green-800 border-transparent dark:bg-green-900/30 dark:text-green-400",
        warning: "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-900/30 dark:text-amber-400",
      },
      size: {
        md: "text-xs px-2.5 py-1",
        sm: "text-[10px] px-2 py-0.5",
      },
    },
    defaultVariants: {
      variant: "muted",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  startIcon?: React.ReactNode
}

function Badge({ className, variant, size, startIcon, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {startIcon && <span className="mr-1.5 inline-flex items-center">{startIcon}</span>}
      {props.children}
    </span>
  )
}

export { Badge, badgeVariants }
