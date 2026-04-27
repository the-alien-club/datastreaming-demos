"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

// `DeleteCardAction` is a small client island used by the otherwise
// server-rendered list pages (agents, specialists, conversations). It owns
// the trash button + AlertDialog confirm + DELETE call + toast + a
// `router.refresh()` on success — the parent page stays a server component
// and re-fetches its data on refresh.
//
// We intentionally don't accept an `onDeleted` callback: the contract is
// "tell Next.js to re-fetch the list". Callers that need optimistic local
// removal can lift the row to a client component themselves.

type Variant = "icon" | "ghost-link"

interface DeleteCardActionProps {
  /** Resource label, e.g. "agent", "specialist", "conversation". Lowercase, singular. */
  resource: string
  /** Human-readable name of the row, shown in the confirmation dialog. */
  name: string
  /** Path to DELETE — e.g. `/api/agents/123`. Routed through `apiFetch`. */
  endpoint: string
  /**
   * Visual treatment:
   *   - `icon` (default): square ghost button used inside `<CardFooter>` rows.
   *   - `ghost-link`: a small icon-only button stamped over a parent <Link>;
   *     `stopPropagation`s clicks so the link doesn't follow.
   */
  variant?: Variant
  /** Optional extra classes for layout in the parent. */
  className?: string
  /** Optional toast on success. Defaults to `<Resource> deleted`. */
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
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  // Stop click bubbling for the `ghost-link` variant — the trash sits
  // inside a parent `<Link>` (conversations row), and a naive click would
  // both open the dialog AND navigate. We stop propagation on both
  // pointer-down and click; pointer-down handles AlertDialog's own
  // dismiss-on-outside logic, click handles the link navigation.
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
      toast.success(successMessage ?? `${capitalize(resource)} deleted`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to delete ${resource}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 text-destructive hover:text-destructive",
          variant === "ghost-link" && "shrink-0",
          className,
        )}
        aria-label={`Delete ${resource}`}
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
        <span className="sr-only">Delete {resource}</span>
      </Button>

      <AlertDialogContent
        // Same reason as the trigger: stop propagation so clicks inside
        // the dialog (on a parent Link) don't navigate.
        onClick={suppressBubble}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {resource}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <span className="font-medium text-foreground">{name}</span>
            . This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleting}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
