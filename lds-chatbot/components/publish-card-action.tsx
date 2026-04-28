"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Globe, Lock, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-fetch"

type ResourceKey = "specialist" | "agent"

interface PublishCardActionProps {
  resource: ResourceKey
  endpoint: string
  isPublic: boolean
}

export function PublishCardAction({ resource, endpoint, isPublic }: PublishCardActionProps) {
  const t = useTranslations("publish")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const resourceLabel = t(`resources.${resource}`)

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
      toast.success(
        isPublic
          ? t("madePrivate", { resource: resourceLabel })
          : t("published", { resource: resourceLabel }),
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed", { resource: resourceLabel }))
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
      {isPublic ? t("makePrivate") : t("makePublic")}
    </Button>
  )
}
