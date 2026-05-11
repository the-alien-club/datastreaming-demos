"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { type McpRecord } from "@/components/cards/mcps/mcp"
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/mcp-options"
import { DEFAULT_MCP_TRANSPORT, MCP_TRANSPORT } from "@/lib/constants"
import { DropdownCategoriesSelect } from "@/components/dropdowns/shared/categories-select"
import { SelectMcpTransportPicker } from "@/components/selects/mcps/transport-picker"
import { SelectMcpTypePicker } from "@/components/selects/mcps/type-picker"

const mcpEditSchema = z.object({
  name: z.string().min(1, "Name is required"),
  serverUrl: z.string().min(1, "Server URL is required"),
  transport: z.string().min(1),
  type: z.string(),
  provider: z.string(),
  pricePerQuery: z.string(),
  categories: z.array(z.string()),
  authToken: z.string(),
  description: z.string(),
  enabled: z.boolean(),
})

type FormMcpEditData = z.infer<typeof mcpEditSchema>

interface DialogMcpEditProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: McpRecord | { isNew: true }
  onSaved: (mcp: McpRecord) => void
}

function buildDefaultValues(initial: McpRecord | { isNew: true }): FormMcpEditData {
  if ("isNew" in initial) {
    return {
      name: "",
      serverUrl: "",
      transport: DEFAULT_MCP_TRANSPORT,
      authToken: "",
      description: "",
      categories: [],
      type: "",
      provider: "",
      pricePerQuery: "",
      enabled: true,
    }
  }
  return {
    name: initial.name,
    serverUrl: initial.serverUrl,
    transport: initial.transport ?? MCP_TRANSPORT.StreamableHttp,
    authToken: initial.authToken ?? "",
    description: initial.description ?? "",
    categories: initial.categories ?? [],
    type: initial.type ?? "",
    provider: initial.provider ?? "",
    pricePerQuery: initial.pricePerQuery ?? "",
    enabled: initial.enabled ?? true,
  }
}

export function DialogMcpEdit({
  open,
  onOpenChange,
  initial,
  onSaved,
}: DialogMcpEditProps) {
  const t = useTranslations("mcps")
  const tCommon = useTranslations("common")
  const isNew = "isNew" in initial

  const form = useForm<FormMcpEditData>({
    resolver: zodResolver(mcpEditSchema),
    defaultValues: buildDefaultValues(initial),
  })

  // Reinitialise when `initial` changes (dialog reopened with a different record)
  useEffect(() => {
    form.reset(buildDefaultValues(initial))
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    onOpenChange(false)
  }

  async function handleSubmit(data: FormMcpEditData) {
    const payload = {
      name: data.name.trim(),
      serverUrl: data.serverUrl.trim(),
      transport: data.transport,
      authToken: data.authToken.trim() || null,
      description: data.description.trim() || null,
      categories: data.categories,
      type: data.type.trim() || null,
      provider: data.provider.trim() || null,
      pricePerQuery: data.pricePerQuery.trim() || null,
      enabled: data.enabled,
    }

    const url = isNew ? "/api/mcps" : `/api/mcps/${(initial as McpRecord).id}`
    const method = isNew ? "POST" : "PUT"
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
    }

    const saved: McpRecord = await res.json()
    toast.success(isNew ? t("created") : t("updated"))
    onSaved(saved)
    handleClose()
  }

  async function handleFormSubmit(data: FormMcpEditData) {
    try {
      await handleSubmit(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedSave"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? t("dialogAddTitle") : t("dialogEditTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{t("nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
                      disabled={form.formState.isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serverUrl"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{t("serverUrlLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("serverUrlPlaceholder")}
                      disabled={form.formState.isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="transport"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>{t("transportLabel")}</FormLabel>
                    <FormControl>
                      <SelectMcpTransportPicker
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>{t("typeLabel")}</FormLabel>
                    <FormControl>
                      <SelectMcpTypePicker
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                        options={TYPE_OPTIONS}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>{t("providerLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="EUR-Lex, Etat, Infogreffe…"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pricePerQuery"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>{t("priceLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Gratuit, 0,01 €…"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{t("categoriesLabel")}</FormLabel>
                  <FormControl>
                    <DropdownCategoriesSelect
                      value={field.value}
                      onChange={field.onChange}
                      disabled={form.formState.isSubmitting}
                      options={CATEGORY_OPTIONS}
                      placeholder={t("categoriesPlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="authToken"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>
                    {t("authTokenLabel")}{" "}
                    <span className="text-muted-foreground font-normal">{t("authTokenHint")}</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("authTokenPlaceholder")}
                      disabled={form.formState.isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>
                    {t("descriptionLabel")}{" "}
                    <span className="text-muted-foreground font-normal">{t("descriptionHint")}</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("descriptionPlaceholder")}
                      disabled={form.formState.isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <input
                      id="mcp-enabled"
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      disabled={form.formState.isSubmitting}
                      className="h-4 w-4 rounded border"
                    />
                  </FormControl>
                  <FormLabel htmlFor="mcp-enabled">{t("enabledLabel")}</FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={form.formState.isSubmitting}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {isNew ? t("addButton") : t("saveButton")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
