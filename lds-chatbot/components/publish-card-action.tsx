"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Globe, Lock, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-fetch"

// Client island for the otherwise server-rendered list pages (specialists).
// Renders a "Make Public" / "Make Private" button and fires a PATCH to
// toggle isPublic. On success it calls router.refresh() so the server
// component re-fetches the updated row — same contract as DeleteCardAction.

interface PublishCardActionProps {
  /** Resource label, e.g. "specialist". Lowercase, singular. */
  resource: string
  /** PATCH endpoint — e.g. `/api/specialists/123`. */
  endpoint: string
  /** Current published state of the row. */
  isPublic: boolean
}

export function PublishCardAction({ resource, endpoint, isPublic }: PublishCardActionProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function handleClick() {
    setPending(true)
    try {
      const res = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      toast.success(isPublic ? `${capitalize(resource)} set to private` : `${capitalize(resource)} published`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to update ${resource}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="flex-1"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : isPublic ? (
        <Lock className="h-3.5 w-3.5 mr-1.5" />
      ) : (
        <Globe className="h-3.5 w-3.5 mr-1.5" />
      )}
      {isPublic ? "Make Private" : "Make Public"}
    </Button>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
