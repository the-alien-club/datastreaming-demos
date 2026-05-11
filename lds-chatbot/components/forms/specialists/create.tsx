"use client"

import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Loader2 } from "lucide-react"
import { Link } from "@/i18n/routing"
import { type PublicAIModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { SelectModelPicker } from "@/components/selects/model/picker"

export interface McpOption {
  id: string
  name: string
  description: string | null
  category: string | null
}

const specialistCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1, "Model is required"),
  mcpIds: z.array(z.string()),
})

export type FormSpecialistCreateData = z.infer<typeof specialistCreateSchema>

type FormSpecialistCreateProps = {
  onSubmit: (data: FormSpecialistCreateData) => Promise<void>
  models: PublicAIModel[]
  availableMcps: McpOption[]
}

export function FormSpecialistCreate({
  onSubmit,
  models,
  availableMcps,
}: FormSpecialistCreateProps) {
  const t = useTranslations("specialists.form")
  const tCommon = useTranslations("common")
  const tSpec = useTranslations("specialists")

  const form = useForm<FormSpecialistCreateData>({
    resolver: zodResolver(specialistCreateSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      model: DEFAULT_MODEL_SLUG,
      mcpIds: [],
    },
  })

  const handleSubmit = async (data: FormSpecialistCreateData) => {
    await onSubmit(data)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("nameLabel")} *</FormLabel>
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {tCommon("descriptionLabel")}{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  {t("descriptionHint")}
                </span>
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
          name="systemPrompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("systemPromptLabel")} *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t("systemPromptPlaceholder")}
                  className="min-h-32 resize-y"
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
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("modelLabel")}</FormLabel>
              <FormControl>
                {models.length === 0 ? (
                  <Input
                    placeholder={DEFAULT_MODEL_SLUG}
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                ) : (
                  <SelectModelPicker
                    value={field.value}
                    onValueChange={field.onChange}
                    models={models}
                    placeholder={tCommon("selectModel")}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mcpIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("mcpToolsLabel")}</FormLabel>
              <FormControl>
                {availableMcps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {tSpec("noMcps")}{" "}
                    <Link href="/mcps" className="underline">{tCommon("addOne")}</Link>{" "}
                    {tSpec("enableTools")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableMcps.map((mcp) => {
                      const checked = field.value.includes(mcp.id)
                      return (
                        <label
                          key={mcp.id}
                          className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={checked}
                            disabled={form.formState.isSubmitting}
                            onChange={() => {
                              const next = checked
                                ? field.value.filter((id) => id !== mcp.id)
                                : [...field.value, mcp.id]
                              field.onChange(next)
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{mcp.name}</p>
                            {mcp.description && (
                              <p className="text-xs text-muted-foreground">{mcp.description}</p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t("createButton")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/specialists">{tCommon("cancel")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
