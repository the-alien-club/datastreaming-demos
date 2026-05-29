"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { TabsAgentSubagentSource } from "@/components/tabs/agents/subagent-source"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { BrainCircuit, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-fetch"
import { SelectModelPicker } from "@/components/selects/model/picker"
import { type PublicAIModel } from "@/lib/platform/client"
import { ListToolbarCompact } from "@/components/list-toolbar-compact"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

interface McpConfig {
  id: string
  name: string
  description: string | null
  categories: string[] | null
}

interface LibrarySpecialist {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  model: string | null
  mcpIds: string | null
}

const subagentCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1, "Model is required"),
  mcpIds: z.array(z.string()),
})

type SubagentCreateData = z.infer<typeof subagentCreateSchema>

interface DialogAgentAddSubagentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: PublicAIModel[]
  mcpList: McpConfig[]
  librarySpecialists: LibrarySpecialist[]
  onSpecialistCreated: (specialist: LibrarySpecialist) => void
  onSubagentAdded: (subagent: {
    name: string
    description: string
    systemPrompt: string
    model: string
    mcpIds: string[]
  }) => void
}

export function DialogAgentAddSubagent({
  open,
  onOpenChange,
  models,
  mcpList,
  librarySpecialists,
  onSpecialistCreated,
  onSubagentAdded,
}: DialogAgentAddSubagentProps) {
  const tCommon = useTranslations("common")
  const tDialog = useTranslations("specialists.dialog")

  const [dialogTab, setDialogTab] = useState<"library" | "new">(
    librarySpecialists.length > 0 ? "library" : "new",
  )
  const [librarySearch, setLibrarySearch] = useState("")
  const [mcpSearch, setMcpSearch] = useState("")

  const form = useForm<SubagentCreateData>({
    resolver: zodResolver(subagentCreateSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      model: DEFAULT_MODEL_SLUG,
      mcpIds: [],
    },
  })

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      setLibrarySearch("")
      setMcpSearch("")
    }
    onOpenChange(nextOpen)
  }

  function addFromLibrary(specialist: LibrarySpecialist) {
    onSubagentAdded({
      name: specialist.name,
      description: specialist.description ?? "",
      systemPrompt: specialist.systemPrompt,
      model: specialist.model ?? DEFAULT_MODEL_SLUG,
      mcpIds: specialist.mcpIds ? JSON.parse(specialist.mcpIds) : [],
    })
    handleOpenChange(false)
    toast.success(tDialog("addedFromLibrary", { name: specialist.name }))
  }

  async function handleNewSubagentSubmit(data: SubagentCreateData) {
    const payload = {
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
      systemPrompt: data.systemPrompt.trim(),
      model: data.model,
      mcpIds: data.mcpIds,
    }

    try {
      const response = await apiFetch("/api/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      const saved: LibrarySpecialist = await response.json()

      onSpecialistCreated(saved)
      onSubagentAdded({
        name: saved.name,
        description: saved.description ?? "",
        systemPrompt: saved.systemPrompt,
        model: saved.model ?? DEFAULT_MODEL_SLUG,
        mcpIds: saved.mcpIds ? JSON.parse(saved.mcpIds) : [],
      })
      handleOpenChange(false)
      toast.success(tDialog("specialistAdded", { name: saved.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tDialog("failedCreate"))
      // Re-throw so react-hook-form marks isSubmitting as false correctly
      throw err
    }
  }

  const primaryCat = (m: McpConfig) => m.categories?.[0] ?? "other"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tDialog("title")}</DialogTitle>
          <DialogDescription>{tDialog("description")}</DialogDescription>
        </DialogHeader>

        <TabsAgentSubagentSource
          value={dialogTab}
          onValueChange={setDialogTab}
          libraryCount={librarySpecialists.length}
          libraryLabel={tDialog("fromLibrary")}
          newLabel={tDialog("createNew")}
        >

          {/* Library tab — untouched logic */}
          <TabsContent value="library">
            {librarySpecialists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <BrainCircuit className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tDialog("emptyLibrary")}</p>
                <Button variant="outline" size="sm" onClick={() => setDialogTab("new")}>
                  {tDialog("createOne")}
                </Button>
              </div>
            ) : (() => {
              const ls = librarySearch.trim().toLowerCase()
              const filteredLib = ls
                ? librarySpecialists.filter((s) => s.name.toLowerCase().includes(ls))
                : librarySpecialists
              return (
                <div className="space-y-2 py-1">
                  <ListToolbarCompact
                    query={librarySearch}
                    onQueryChange={setLibrarySearch}
                  />
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredLib.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {tCommon("noResults")}
                      </p>
                    ) : filteredLib.map((s) => {
                      const mcpIds: string[] = s.mcpIds ? JSON.parse(s.mcpIds) : []
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => addFromLibrary(s)}
                        >
                          <p className="text-sm font-medium">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {s.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <Badge variant="outline" className="text-xs">
                              {s.model ?? DEFAULT_MODEL_SLUG}
                            </Badge>
                            {mcpIds.map((mcpId) => {
                              const mcp = mcpList.find((m) => m.id === mcpId)
                              return (
                                <Badge key={mcpId} variant="secondary" className="text-xs">
                                  {mcp?.name ?? mcpId}
                                </Badge>
                              )
                            })}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* New tab — RHF form */}
          <TabsContent value="new">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleNewSubagentSubmit)}>
                <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel>{tDialog("nameLabel")}</FormLabel>
                        <FormControl>
                          <Input
                            id="sa-name"
                            placeholder={tDialog("namePlaceholder")}
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
                      <FormItem className="space-y-1.5">
                        <FormLabel>
                          {tDialog("descLabel")}{" "}
                          <span className="text-muted-foreground text-xs font-normal">
                            {tDialog("descHint")}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            id="sa-desc"
                            placeholder={tDialog("descHint")}
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
                      <FormItem className="space-y-1.5">
                        <FormLabel>{tDialog("promptLabel")}</FormLabel>
                        <FormControl>
                          <Textarea
                            id="sa-prompt"
                            className="min-h-24 resize-y text-sm"
                            placeholder={tDialog("promptPlaceholder")}
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
                      <FormItem className="space-y-1.5">
                        <FormLabel>{tCommon("modelLabel")}</FormLabel>
                        <FormControl>
                          {models.length === 0 ? (
                            <Input
                              id="sa-model"
                              placeholder={DEFAULT_MODEL_SLUG}
                              disabled={form.formState.isSubmitting}
                              {...field}
                            />
                          ) : (
                            <SelectModelPicker
                              id="sa-model"
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
                      <FormItem className="space-y-2">
                        <FormLabel>{tCommon("mcpToolsLabel")}</FormLabel>
                        <FormControl>
                          {mcpList.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">
                              {tCommon("noMcps")}
                            </p>
                          ) : (() => {
                            const ms = mcpSearch.trim().toLowerCase()
                            const filteredMcps = ms
                              ? mcpList.filter((m) => m.name.toLowerCase().includes(ms))
                              : mcpList
                            const cats = Array.from(new Set(filteredMcps.map(primaryCat)))
                            return (
                              <div className="space-y-2">
                                <ListToolbarCompact
                                  query={mcpSearch}
                                  onQueryChange={setMcpSearch}
                                />
                                <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                                  {filteredMcps.length === 0 ? (
                                    <p className="py-4 text-center text-sm text-muted-foreground">
                                      {tCommon("noResults")}
                                    </p>
                                  ) : cats.map((cat) => (
                                    <div key={cat}>
                                      <p className="text-xs font-medium text-muted-foreground capitalize tracking-wide mb-1.5">
                                        {cat}
                                      </p>
                                      <div className="space-y-1.5">
                                        {filteredMcps
                                          .filter((m) => primaryCat(m) === cat)
                                          .map((mcp) => {
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
                                                    <p className="text-xs text-muted-foreground">
                                                      {mcp.description}
                                                    </p>
                                                  )}
                                                </div>
                                              </label>
                                            )
                                          })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={form.formState.isSubmitting}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {tDialog("addSpecialist")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </TabsAgentSubagentSource>
      </DialogContent>
    </Dialog>
  )
}
