"use client"

// components/layouts/workspace/step-nav.tsx
// LayoutWorkspaceStepNav — the Corpus → Ingestion → Research progression in the
// workspace header. Derives the active step from the current pathname and
// renders the prototype's numbered-dot + connecting-line treatment: steps before
// the active one show a check, the active one is highlighted, later ones are
// pending.

import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { ROUTES, WORKSPACE_STEPS, type WorkspaceStep } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface LayoutWorkspaceStepNavProps {
  projectId: string
}

const STEP_HREF: Record<WorkspaceStep, (projectId: string) => string> = {
  corpus: ROUTES.corpus,
  ingest: ROUTES.ingest,
  research: ROUTES.research,
}

function activeStepFromPathname(pathname: string): WorkspaceStep {
  // Notebook is a sub-view of Research; match it to the research step.
  if (pathname.includes("/research")) return "research"
  if (pathname.includes("/ingest")) return "ingest"
  return "corpus"
}

export function LayoutWorkspaceStepNav({
  projectId,
}: LayoutWorkspaceStepNavProps) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const activeStep = activeStepFromPathname(pathname)
  const activeIndex = WORKSPACE_STEPS.indexOf(activeStep)

  return (
    <nav className="flex items-center gap-1" aria-label={t("corpus")}>
      {WORKSPACE_STEPS.map((step, index) => {
        const isDone = index < activeIndex
        const isActive = index === activeIndex

        return (
          <div key={step} className="flex items-center gap-1">
            {index > 0 && (
              <div className="mx-0.5 h-px w-6 bg-border" aria-hidden />
            )}
            <Link
              href={STEP_HREF[step](projectId)}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                  isActive && "bg-primary text-primary-foreground",
                  isDone && "bg-brand-teal/20 text-brand-teal",
                  !isActive && !isDone && "bg-secondary text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span className={cn("font-medium", isActive && "text-foreground")}>
                {t(step)}
              </span>
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
