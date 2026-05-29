"use client"

import { useTranslations } from "next-intl"
import { useForm, useFieldArray } from "react-hook-form"
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
  FormDescription,
  FormMessage,
} from "@/components/ui/form"
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react"
import { type PublicAIModel } from "@/lib/platform/client"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"
import { SelectModelPicker } from "@/components/selects/model/picker"
import { Switch } from "@/components/ui/switch"

const stepSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  prompt: z.string(),
})

const agentEditSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  author: z.string().optional(),
  createdAt: z.string().optional(),
  systemPrompt: z.string(),
  model: z.string().min(1, "Model is required"),
  steps: z.array(stepSchema),
  isForkable: z.boolean(),
})

export type FormAgentEditData = z.infer<typeof agentEditSchema>

type FormAgentEditProps = {
  initialValues: {
    name: string
    description: string
    author: string
    createdAt: string
    systemPrompt: string
    model: string
    steps: { name: string; prompt: string }[]
    isForkable: boolean
  }
  models: PublicAIModel[]
  onSubmit: (data: FormAgentEditData) => Promise<void>
  /** When true the built-in submit button is not rendered.
   *  Use this when the form is embedded in a page that renders
   *  its own Save button below additional non-form sections. */
  hideSubmit?: boolean
}

export function FormAgentEdit({
  initialValues,
  models,
  onSubmit,
  hideSubmit = false,
}: FormAgentEditProps) {
  const t = useTranslations("agents.form")
  const tCommon = useTranslations("common")

  const form = useForm<FormAgentEditData>({
    resolver: zodResolver(agentEditSchema),
    defaultValues: {
      name: initialValues.name,
      description: initialValues.description,
      author: initialValues.author,
      createdAt: initialValues.createdAt,
      systemPrompt: initialValues.systemPrompt,
      model: initialValues.model,
      steps: initialValues.steps,
      isForkable: initialValues.isForkable,
    },
  })

  const { fields, append, remove, swap } = useFieldArray({
    control: form.control,
    name: "steps",
  })

  const handleSubmit = async (data: FormAgentEditData) => {
    await onSubmit(data)
  }

  return (
    <Form {...form}>
      <form id="agent-edit-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("nameLabel")} *</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("agentNamePlaceholder")}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="author"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("authorLabel")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("authorPlaceholder")}
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t("authorHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="createdAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("createdAtLabel")}</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="block"
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
          name="systemPrompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tCommon("systemPromptLabel")}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t("systemPromptPlaceholder2")}
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
          name="isForkable"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>{t("isForkableLabel")}</FormLabel>
                  <FormDescription className="text-xs">
                    {t("isForkableHint")}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={form.formState.isSubmitting}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">{t("stepsTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("stepsSubtitle")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={form.formState.isSubmitting}
              onClick={() => append({ name: "", prompt: "" })}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("addStep")}
            </Button>
          </div>

          <div className="space-y-2">
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">{t("noSteps")}</p>
            )}

            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-md border p-3 space-y-2 bg-muted/30">
                <FormField
                  control={form.control}
                  name={`steps.${idx}.name`}
                  render={({ field: nameField }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder={t("stepNamePlaceholder")}
                          disabled={form.formState.isSubmitting}
                          autoFocus={nameField.value === ""}
                          {...nameField}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`steps.${idx}.prompt`}
                  render={({ field: promptField }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder={t("stepInstructionsPlaceholder")}
                          className="min-h-20 resize-y text-sm"
                          disabled={form.formState.isSubmitting}
                          {...promptField}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0 || form.formState.isSubmitting}
                    onClick={() => swap(idx, idx - 1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === fields.length - 1 || form.formState.isSubmitting}
                    onClick={() => swap(idx, idx + 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={form.formState.isSubmitting}
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!hideSubmit && (
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t("saveButton")}
          </Button>
        )}
      </form>
    </Form>
  )
}
