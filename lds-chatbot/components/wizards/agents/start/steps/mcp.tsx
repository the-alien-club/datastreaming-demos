"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import type { WizardSetState, WizardState } from "../state"

interface AvailableMcp {
  id: string
  name: string
  description: string | null
  category: string | null
  source: "builtin" | "user"
}

interface AvailableMcpsResponse {
  legal: AvailableMcp[]
  otherBuiltin: AvailableMcp[]
  userMcps: AvailableMcp[]
}

interface McpStepContentProps {
  state: WizardState
  setState: WizardSetState
}

export function McpStepContent({ state, setState }: McpStepContentProps) {
  const [available, setAvailable] = useState<AvailableMcpsResponse>({
    legal: [],
    otherBuiltin: [],
    userMcps: [],
  })
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newMcpName, setNewMcpName] = useState("")
  const [newMcpUrl, setNewMcpUrl] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/mcps/available")
      .then((r) => (r.ok ? r.json() : { legal: [], otherBuiltin: [], userMcps: [] }))
      .then((data: AvailableMcpsResponse) => {
        if (cancelled) return
        setAvailable(data)
      })
      .catch(() => {
        if (cancelled) return
        setAvailable({ legal: [], otherBuiltin: [], userMcps: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleMcp(id: string) {
    setState((prev) => {
      const has = prev.selectedMcpIds.includes(id)
      return {
        ...prev,
        selectedMcpIds: has
          ? prev.selectedMcpIds.filter((m) => m !== id)
          : [...prev.selectedMcpIds, id],
      }
    })
  }

  async function handleAddMcp() {
    const name = newMcpName.trim()
    const url = newMcpUrl.trim()
    if (!name || !url) {
      toast.error("Name and URL are required")
      return
    }
    setAdding(true)
    try {
      const response = await apiFetch("/api/mcps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          serverUrl: url,
          transport: "streamable_http",
          enabled: true,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error ?? `HTTP ${response.status}`)
      }
      const created = (await response.json()) as { id: string; name: string; description: string | null; category: string | null }
      const newMcp: AvailableMcp = {
        id: created.id,
        name: created.name,
        description: created.description,
        category: created.category,
        source: "user",
      }
      setAvailable((prev) => ({ ...prev, userMcps: [newMcp, ...prev.userMcps] }))
      setState((prev) => ({ ...prev, selectedMcpIds: [...prev.selectedMcpIds, newMcp.id] }))
      setNewMcpName("")
      setNewMcpUrl("")
      setAddOpen(false)
      toast.success("MCP server added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add MCP")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Connect tools to your <span className="font-semibold text-foreground">{state.specialistName || "specialist"}</span>. Skip if it doesn&apos;t need any.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading available tools...
        </div>
      ) : (
        <div className="space-y-4">
          {available.legal.length > 0 && (
            <McpGroup
              title="Built-in legal tools"
              mcps={available.legal}
              selectedIds={state.selectedMcpIds}
              onToggle={toggleMcp}
            />
          )}
          {available.otherBuiltin.length > 0 && (
            <McpGroup
              title="Other built-in tools"
              mcps={available.otherBuiltin}
              selectedIds={state.selectedMcpIds}
              onToggle={toggleMcp}
            />
          )}
          {available.userMcps.length > 0 && (
            <McpGroup
              title="Your MCP servers"
              mcps={available.userMcps}
              selectedIds={state.selectedMcpIds}
              onToggle={toggleMcp}
            />
          )}
        </div>
      )}

      <div className="rounded-md border bg-muted/20 p-3">
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add custom MCP server
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">New MCP server</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => {
                  setAddOpen(false)
                  setNewMcpName("")
                  setNewMcpUrl("")
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-mcp-name" className="text-xs">
                Name
              </Label>
              <Input
                id="wizard-mcp-name"
                value={newMcpName}
                onChange={(e) => setNewMcpName(e.target.value)}
                placeholder="e.g. Internal contracts MCP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-mcp-url" className="text-xs">
                URL
              </Label>
              <Input
                id="wizard-mcp-url"
                value={newMcpUrl}
                onChange={(e) => setNewMcpUrl(e.target.value)}
                placeholder="https://example.com/mcp"
              />
            </div>
            <Button type="button" size="sm" onClick={handleAddMcp} disabled={adding}>
              {adding && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Add server
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function McpGroup({
  title,
  mcps,
  selectedIds,
  onToggle,
}: {
  title: string
  mcps: AvailableMcp[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {mcps.map((mcp) => {
          const checked = selectedIds.includes(mcp.id)
          return (
            <button
              key={mcp.id}
              type="button"
              onClick={() => onToggle(mcp.id)}
              className={cn(
                "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent/30",
                checked ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{mcp.name}</span>
                {checked && (
                  <Badge variant="default" className="text-[10px]">
                    Selected
                  </Badge>
                )}
              </div>
              {mcp.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{mcp.description}</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
