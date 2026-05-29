"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { AlertDialogDeleteConfirm } from "@/components/alerts/shared/delete-confirm"

type Variant = "icon" | "ghost-link"

// `resource` must be a key in delete.resources (e.g. "agent", "specialist").
type ResourceKey = "agent" | "specialist" | "conversation" | "dataset" | "mcp"

interface DeleteCardActionProps {
  resource: ResourceKey
  name: string
  endpoint: string
  variant?: Variant
  className?: string
  successMessage?: string
}

export function DeleteCardAction({
  resource,
  name,
  endpoint,
  variant = "icon",
  className,
  successMessage,
}: DeleteCardActionProps) {
  const t = useTranslations("common.delete")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const resourceLabel = t(`resources.${resource}`)

  function suppressBubble(e: React.SyntheticEvent) {
    e.stopPropagation()
  }

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    setDeleting(true)
    try {
      const res = await apiFetch(endpoint, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }
      toast.success(successMessage ?? t("deleted", { resource: resourceLabel }))
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed", { resource: resourceLabel }))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 text-destructive hover:text-destructive",
          variant === "ghost-link" && "shrink-0",
          className,
        )}
        aria-label={t("confirm")}
        onPointerDownCapture={variant === "ghost-link" ? suppressBubble : undefined}
        onClick={(e) => {
          if (variant === "ghost-link") {
            e.preventDefault()
            e.stopPropagation()
          }
          setOpen(true)
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <AlertDialogDeleteConfirm
        open={open}
        onOpenChange={setOpen}
        resourceLabel={resourceLabel}
        name={name}
        onConfirm={handleConfirm}
        deleting={deleting}
        onClick={suppressBubble}
      />
    </>
  )
}
