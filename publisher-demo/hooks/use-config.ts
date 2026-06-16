"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  AvailableCluster,
  AvailableDataset,
  AvailableExternalApi,
  ConfigClusterEntry,
  ConfigExternalApiEntry,
  DemoConfigResponse,
  McpConfigurationPickerPayload,
} from "@/lib/platform/types"

const CONFIG_KEY = ["demo", "config"] as const

async function fetchConfig(): Promise<DemoConfigResponse> {
  const res = await fetch("/api/demo/config", { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`config ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as DemoConfigResponse
}

async function putConfig(payload: McpConfigurationPickerPayload): Promise<DemoConfigResponse> {
  const res = await fetch("/api/demo/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`config PUT ${res.status}: ${body.slice(0, 200)}`)
  }
  // Returns { configuration } after PUT — refetch the full GET to also
  // refresh the sources catalog.
  return fetchConfig()
}

/**
 * Toggle target. `kind: "cluster-all"` (un)checks every dataset under one
 * cluster (mirrors clicking the parent row in the design).
 */
export type ConfigToggle =
  | { kind: "dataset"; clusterId: number; datasetId: number }
  | { kind: "cluster-all"; clusterId: number }
  | { kind: "connector"; connectorId: number }

/** Indexed view returned to panels — each leaf knows its checked state. */
export interface ConfigViewCluster {
  cluster_id: number
  name: string
  description: string
  /** Default-open in the UI; the picker tree drives expand/collapse locally. */
  datasets: Array<AvailableDataset & { checked: boolean }>
  /** Tools the platform exposes for this cluster. */
  toolNames: string[]
}

export interface ConfigViewExternalApi {
  connector_id: number
  slug: string
  name: string
  description: string | null
  checked: boolean
  toolNames: string[]
  endpointCount: number
}

export interface ConfigView {
  clusters: ConfigViewCluster[]
  externalApis: ConfigViewExternalApi[]
}

export interface UseConfigResult {
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  /** Real configuration row from the platform. */
  configuration: DemoConfigResponse["configuration"] | null
  /** Source catalog (clusters + external_apis the user could enable). */
  sources: DemoConfigResponse["sources"] | null
  /** View merged from sources + draft state; render panels from this. */
  view: ConfigView | null
  /** True when the local draft differs from the server-saved state. */
  isDirty: boolean
  /** True while a PUT is in flight. */
  isSaving: boolean
  /** True for ~1.5s after a successful save (drives the chip pulse). */
  justSaved: boolean
  toggle: (t: ConfigToggle) => void
  /** Discard local changes and revert to the server-saved state. */
  reset: () => void
  /** PUT the current draft. */
  save: () => Promise<void>
}

interface DraftState {
  /** clusterId → set of dataset IDs enabled in the draft. */
  datasetIdsByCluster: Map<number, Set<number>>
  /** Enabled connector IDs in the draft. */
  enabledConnectors: Set<number>
  /** Per-cluster tool selection — defaulted to "all available tools". */
  toolsByCluster: Map<number, string[]>
  /** Per-connector tool selection — defaulted to "all available tools". */
  toolsByConnector: Map<number, string[]>
}

/**
 * Map the platform's saved configuration into the local draft shape. Each
 * configured cluster contributes its `dataset_ids` AND its `tools` array;
 * datasets and connectors not listed in the saved config are treated as
 * unchecked in the draft.
 */
function buildDraftFromServer(
  saved: McpConfigurationPickerPayload,
  sources: DemoConfigResponse["sources"],
): DraftState {
  const datasetIdsByCluster = new Map<number, Set<number>>()
  const toolsByCluster = new Map<number, string[]>()
  const enabledConnectors = new Set<number>()
  const toolsByConnector = new Map<number, string[]>()

  // Build the membership maps from the saved configuration first.
  //
  // Platform convention: omitting `dataset_ids` on a saved cluster means
  // "all datasets included". The draft, in contrast, treats an empty set
  // as "cluster unchecked" (see draftToPayload). Expand the omitted case
  // to the cluster's full dataset catalog so the round-trip is stable and
  // the UI shows the cluster as fully checked instead of empty.
  const catalogByClusterId = new Map(sources.clusters.map((c) => [c.cluster_id, c]))
  for (const entry of saved.clusters ?? []) {
    const catalog = catalogByClusterId.get(entry.cluster_id)
    const datasetIds = entry.dataset_ids
      ? new Set(entry.dataset_ids)
      : new Set(catalog?.datasets.map((d) => d.id) ?? [])
    datasetIdsByCluster.set(entry.cluster_id, datasetIds)
    toolsByCluster.set(entry.cluster_id, [...(entry.tools ?? [])])
  }
  for (const entry of saved.external_apis ?? []) {
    enabledConnectors.add(entry.connector_id)
    toolsByConnector.set(entry.connector_id, [...(entry.tools ?? [])])
  }

  // For every catalog cluster NOT in the saved config, default to empty
  // dataset set + all-tools-on (the picker convention: toggling the cluster
  // on enables every tool the platform exposes for it).
  for (const cluster of sources.clusters) {
    if (!datasetIdsByCluster.has(cluster.cluster_id)) {
      datasetIdsByCluster.set(cluster.cluster_id, new Set())
      toolsByCluster.set(
        cluster.cluster_id,
        cluster.tools.map((t) => t.name),
      )
    }
  }
  for (const connector of sources.external_apis) {
    if (!toolsByConnector.has(connector.connector_id)) {
      toolsByConnector.set(
        connector.connector_id,
        connector.tools.map((t) => t.name),
      )
    }
  }

  return { datasetIdsByCluster, enabledConnectors, toolsByCluster, toolsByConnector }
}

function cloneDraft(d: DraftState): DraftState {
  return {
    datasetIdsByCluster: new Map(
      Array.from(d.datasetIdsByCluster.entries()).map(([k, v]) => [k, new Set(v)]),
    ),
    enabledConnectors: new Set(d.enabledConnectors),
    toolsByCluster: new Map(Array.from(d.toolsByCluster.entries()).map(([k, v]) => [k, [...v]])),
    toolsByConnector: new Map(
      Array.from(d.toolsByConnector.entries()).map(([k, v]) => [k, [...v]]),
    ),
  }
}

function draftToPayload(
  d: DraftState,
  sources: DemoConfigResponse["sources"],
): McpConfigurationPickerPayload {
  const catalogByClusterId = new Map(sources.clusters.map((c) => [c.cluster_id, c]))
  const clusters: ConfigClusterEntry[] = []
  for (const [clusterId, datasetIds] of d.datasetIdsByCluster) {
    // A cluster is "selected" iff at least one of its datasets is checked.
    // The cluster-row toggle clears datasetIds for that cluster, so an empty
    // set means the user has unchecked the cluster — exclude it from the
    // saved configuration so the platform doesn't fan out to it.
    if (datasetIds.size === 0) continue
    const tools = d.toolsByCluster.get(clusterId) ?? []
    if (tools.length === 0) continue
    // Platform convention: omit `dataset_ids` when every dataset is selected
    // so the saved payload round-trips byte-equal with the platform response
    // (which omits the field on "all included"). Without this, isDirty would
    // flip true on every hydration of a fully-checked cluster.
    const catalog = catalogByClusterId.get(clusterId)
    const allSelected =
      !!catalog &&
      catalog.datasets.length > 0 &&
      catalog.datasets.length === datasetIds.size &&
      catalog.datasets.every((dataset) => datasetIds.has(dataset.id))
    clusters.push({
      cluster_id: clusterId,
      tools,
      ...(allSelected ? {} : { dataset_ids: Array.from(datasetIds).sort((a, b) => a - b) }),
    })
  }
  const external_apis: ConfigExternalApiEntry[] = []
  for (const connectorId of d.enabledConnectors) {
    const tools = d.toolsByConnector.get(connectorId) ?? []
    if (tools.length === 0) continue
    external_apis.push({ connector_id: connectorId, tools })
  }
  return { clusters, external_apis }
}

function payloadsEqual(
  a: McpConfigurationPickerPayload,
  b: McpConfigurationPickerPayload,
): boolean {
  return stableStringify(a) === stableStringify(b)
}

// JSON.stringify is insertion-order sensitive. The server returns clusters as
// {tools, cluster_id, dataset_ids} but draftToPayload builds them as
// {cluster_id, tools, dataset_ids} — same data, different output. Sort keys
// so structurally equal payloads compare equal.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

function buildView(sources: DemoConfigResponse["sources"], draft: DraftState): ConfigView {
  const clusters: ConfigViewCluster[] = sources.clusters.map((c: AvailableCluster) => {
    const enabled = draft.datasetIdsByCluster.get(c.cluster_id) ?? new Set<number>()
    return {
      cluster_id: c.cluster_id,
      name: c.name,
      description: c.description,
      datasets: c.datasets.map((d) => ({ ...d, checked: enabled.has(d.id) })),
      toolNames: c.tools.map((t) => t.name),
    }
  })
  const externalApis: ConfigViewExternalApi[] = sources.external_apis.map(
    (a: AvailableExternalApi) => ({
      connector_id: a.connector_id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      checked: draft.enabledConnectors.has(a.connector_id),
      toolNames: a.tools.map((t) => t.name),
      endpointCount: a.tools.length,
    }),
  )
  return { clusters, externalApis }
}

export function useConfig(): UseConfigResult {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,
  })

  // Local draft kept in component state. Resets whenever the server data
  // refetches (e.g. after a successful save). Otherwise edits live here.
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (query.data) {
      setDraft(buildDraftFromServer(query.data.configuration.config, query.data.sources))
    }
  }, [query.data])

  const savedPayload = useMemo<McpConfigurationPickerPayload | null>(
    () => (query.data ? query.data.configuration.config : null),
    [query.data],
  )

  const draftPayload = useMemo<McpConfigurationPickerPayload | null>(
    () => (draft && query.data ? draftToPayload(draft, query.data.sources) : null),
    [draft, query.data],
  )

  const isDirty = useMemo(() => {
    if (!savedPayload || !draftPayload) return false
    return !payloadsEqual(savedPayload, draftPayload)
  }, [savedPayload, draftPayload])

  const view = useMemo<ConfigView | null>(() => {
    if (!query.data || !draft) return null
    return buildView(query.data.sources, draft)
  }, [query.data, draft])

  const toggle = useCallback(
    (t: ConfigToggle) => {
      setDraft((prev) => {
        if (!prev) return prev
        const next = cloneDraft(prev)
        switch (t.kind) {
          case "dataset": {
            const set = next.datasetIdsByCluster.get(t.clusterId) ?? new Set<number>()
            if (set.has(t.datasetId)) set.delete(t.datasetId)
            else set.add(t.datasetId)
            next.datasetIdsByCluster.set(t.clusterId, set)
            break
          }
          case "cluster-all": {
            // Find the catalog cluster to compute "all datasets". Cluster
            // catalog is in the query data; capture via a closure-stable map
            // by reading the cluster's known dataset ids from the draft side
            // (we keep these populated even for unchecked clusters because
            // buildDraftFromServer seeds them).
            // For "all" toggling we need the catalog — read it from the cluster
            // entry in the existing membership. We assume membership map keys
            // for every catalog cluster (buildDraftFromServer guarantees this).
            // Here we can't read sources directly; emit the existing set's
            // inverse and rely on a separate clearing path. Instead, peek at
            // catalog via global query cache.
            // The membership maps were seeded with empty sets for all clusters;
            // the catalog dataset IDs are needed. Fall back to reading from
            // cache via the stale data we already have.
            const cached = queryClient.getQueryData<DemoConfigResponse>(CONFIG_KEY)
            const catalog = cached?.sources.clusters.find((c) => c.cluster_id === t.clusterId)
            if (!catalog) break
            const allIds = catalog.datasets.map((d) => d.id)
            const current = next.datasetIdsByCluster.get(t.clusterId) ?? new Set<number>()
            const allOn = allIds.length > 0 && allIds.every((id) => current.has(id))
            next.datasetIdsByCluster.set(t.clusterId, allOn ? new Set() : new Set(allIds))
            break
          }
          case "connector": {
            if (next.enabledConnectors.has(t.connectorId)) {
              next.enabledConnectors.delete(t.connectorId)
            } else {
              next.enabledConnectors.add(t.connectorId)
            }
            break
          }
        }
        return next
      })
    },
    [queryClient],
  )

  const reset = useCallback(() => {
    if (query.data) {
      setDraft(buildDraftFromServer(query.data.configuration.config, query.data.sources))
    }
  }, [query.data])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draftPayload) throw new Error("nothing to save")
      return putConfig(draftPayload)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(CONFIG_KEY, data)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1500)
    },
  })

  const save = useCallback(async () => {
    await mutation.mutateAsync()
  }, [mutation])

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    configuration: query.data?.configuration ?? null,
    sources: query.data?.sources ?? null,
    view,
    isDirty,
    isSaving: mutation.isPending,
    justSaved,
    toggle,
    reset,
    save,
  }
}

/**
 * Resolve a tool name back to its source (cluster / connector) using the
 * loaded sources catalog. Used to translate live agent tool calls into the
 * panel ripple events. Returns null if the tool name doesn't match anything
 * in the catalog (e.g. an MCP tool the demo doesn't expose).
 */
export function resolveToolSource(
  sources: DemoConfigResponse["sources"] | null,
  toolName: string,
):
  | {
      kind: "dataset"
      cluster: AvailableCluster
    }
  | {
      kind: "api"
      connector: AvailableExternalApi
    }
  | null {
  if (!sources) return null
  // The Claude SDK exposes MCP tools as `mcp__<server>__<tool>` (e.g.
  // `mcp__alien__datacluster_keyword_search`). The catalog stores the bare
  // tool name (`datacluster_keyword_search`). Strip the prefix before lookup.
  const bare = stripMcpPrefix(toolName)
  for (const cluster of sources.clusters) {
    if (cluster.tools.some((t) => t.name === bare)) {
      return { kind: "dataset", cluster }
    }
  }
  for (const connector of sources.external_apis) {
    if (connector.tools.some((t) => t.name === bare)) {
      return { kind: "api", connector }
    }
  }
  return null
}

export function stripMcpPrefix(toolName: string): string {
  // Claude SDK convention (Mode B): mcp__<server>__<tool>. Both segments can
  // contain single underscores; the delimiter is exactly `__`. Split on the
  // double underscore and take everything after the second one.
  // Example: mcp__alien__datacluster_keyword_search → datacluster_keyword_search.
  const parts = toolName.split("__")
  if (parts.length >= 3 && parts[0] === "mcp") return parts.slice(2).join("__")
  // Platform Responses-API convention (Mode A): mcp_<connector-slug>_<tool>
  // where slug keeps its hyphens. The catalog stores `<slug>_<tool>` directly
  // as the tool name, so just strip the leading `mcp_`.
  // Example: mcp_openaire-knowledge-graph-api_search → openaire-knowledge-graph-api_search.
  if (toolName.startsWith("mcp_")) return toolName.slice("mcp_".length)
  return toolName
}
