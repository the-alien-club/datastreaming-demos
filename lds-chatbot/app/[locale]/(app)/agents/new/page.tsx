"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"

import type { PublicAIModel } from "@/lib/platform/client"
import { providerLabelFromModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

type AIModel = PublicAIModel

export default function NewAgentPage() {
  const t = useTranslations("agentForm")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [models, setModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL_SLUG)

  useEffect(() => {
    apiFetch("/api/models")
      .then((r) => r.json())
      .then((data: AIModel[]) => {
        setModels(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setLoadingModels(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error(tCommon("nameRequired"))
      return
    }

    setSubmitting(true)
    try {
      const response = await apiFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          model,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }

      const agent = await response.json()
      toast.success(t("agentCreated"))
      router.push(`/agents/${agent.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedCreate"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{tCommon("nameLabel")} *</Label>
          <Input
            id="name"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{tCommon("descriptionLabel")}</Label>
          <Input
            id="description"
            placeholder={t("descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="systemPrompt">{tCommon("systemPromptLabel")}</Label>
          <Textarea
            id="systemPrompt"
            placeholder={t("systemPromptPlaceholder")}
            className="min-h-32 resize-y"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">{tCommon("modelLabel")}</Label>
          {loadingModels || models.length === 0 ? (
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL_SLUG}
            />
          ) : (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue placeholder={tCommon("selectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.slug}>
                    <span>{m.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {providerLabelFromModel(m)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("createButton")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/agents">{tCommon("cancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
