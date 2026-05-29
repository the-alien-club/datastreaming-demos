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
import { type PublicAIModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { SelectModelPicker } from "@/components/selects/model/picker"

const agentCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1, "Model is required"),
})

export type FormAgentCreateData = z.infer<typeof agentCreateSchema>

type FormAgentCreateProps = {
  onSubmit: (data: FormAgentCreateData) => Promise<void>
  models: PublicAIModel[]
}

export function FormAgentCreate({ onSubmit, models }: FormAgentCreateProps) {
  const t = useTranslations("agents.form")
  const tCommon = useTranslations("common")

  const form = useForm<FormAgentCreateData>({
    resolver: zodResolver(agentCreateSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      model: DEFAULT_MODEL_SLUG,
    },
  })

  const handleSubmit = async (data: FormAgentCreateData) => {
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
              <FormLabel>{tCommon("descriptionLabel")}</FormLabel>
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

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {t("createButton")}
        </Button>
      </form>
    </Form>
  )
}
