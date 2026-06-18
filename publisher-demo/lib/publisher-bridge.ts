/**
 * PublisherBridge — translates the SDK's normalized `ChatEvent` stream into
 * the demo's enriched `DemoEvent` bus. This is the ONLY place that knows about
 * both the SDK's wire format and the demo's panel-specific attribution
 * semantics (per-cluster royalty buckets, entry→dataset cache, API-tool
 * connector ids, Mode A cost-breakdown brick replay with double-count
 * suppression).
 *
 * The bridge is stateful (it accumulates a session-wide entry→dataset map and
 * per-turn live-settle book-keeping) but holds no React state — it's a plain
 * object you create once per chat session and reset on `reset-chat`. The
 * `use-publisher-bridge` hook wraps this in stable refs so the consumer's
 * `onEvent` callback can call `bridge.feed(event)` from any render.
 *
 * Reusable pieces still live in their original homes:
 *   - `extractResultMeta` / `snippetForDisplay` — `lib/result-meta.ts`
 *   - `resolveToolSource` — `hooks/use-config.ts`
 *   - `computeRoyalty` — `hooks/use-pricing.ts`
 *
 * This module just orchestrates them.
 */
import type { ChatEvent, CostBrick } from "@alien/chat-sdk/events"
import { resolveToolSource } from "@/hooks/use-config"
import type { DemoEvent, ToolCallEvent, ToolResultEvent } from "@/hooks/use-demo-events"
import type { UsePricingResult } from "@/hooks/use-pricing"
import { extractResultMeta, snippetForDisplay } from "@/lib/result-meta"
import type { AvailableSourcesResponse } from "@/lib/platform/types"

// ── Local helpers (lifted verbatim from use-orchestrator-state.ts) ─────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

function sumEntries(entriesPerDataset: Record<number, number>): number {
  let total = 0
  for (const n of Object.values(entriesPerDataset)) total += n
  return total
}

function extractEntryIdArg(args: Record<string, unknown> | null): number | null {
  if (!args) return null
  const raw = args.entry_id ?? args.entryId
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseCompositeEntryArg(
  args: Record<string, unknown> | null,
): { clusterId: number; datasetId: number; entryId: number } | null {
  if (!args) return null
  const raw = args.composite_id ?? args.compositeId ?? args.composite_entry_id
  if (typeof raw !== "string") return null
  const parts = raw.split(":")
  if (parts.length !== 3) return null
  const [c, d, e] = parts.map((p) => Number(p))
  if (
    !Number.isInteger(c) ||
    !Number.isInteger(d) ||
    !Number.isInteger(e) ||
    (c ?? 0) <= 0 ||
    (d ?? 0) <= 0 ||
    (e ?? 0) <= 0
  ) {
    return null
  }
  return { clusterId: c as number, datasetId: d as number, entryId: e as number }
}

// ── Public types ───────────────────────────────────────────────────────────

export interface BridgeAttribution {
  /** Source kind resolved at dispatch time. */
  kind: "dataset" | "api"
  /** Cluster name OR connector name OR `toolName` fallback. */
  attributionLabel: string
  /** Tape-row anchor key the panels group by. */
  attributionKey: string
  /** Set when `kind === "api"`. */
  connectorId: number | null
}

/** Tool dispatch info recorded at `tool-call-start` and consumed at
 *  `tool-result`. Mirrors the orchestrator's old `toolDispatchRef`. */
interface DispatchEntry extends BridgeAttribution {
  toolName: string
  args: Record<string, unknown> | null
  toolUseId: string
}

export interface PublisherBridgeDeps {
  emit: (event: DemoEvent) => void
  sources: AvailableSourcesResponse | null
  computeRoyalty: UsePricingResult["computeRoyalty"]
}

export interface PublisherBridge {
  /** Feed a raw SDK `ChatEvent`. Side-effects: emits zero-or-more DemoEvents
   *  and updates internal state. */
  feed(event: ChatEvent): void
  /** Look up the attribution captured for a tool call. Used by the chat
   *  panel to label tool cards with the resolved cluster/connector. */
  getAttribution(toolUseId: string): BridgeAttribution | null
  /** Wipe per-session state (entry→dataset cache, dispatches, etc.). The
   *  consumer calls this on mode switch / reset; it does NOT emit the
   *  `reset-chat` DemoEvent (the caller owns that). */
  reset(): void
  /** Sources/pricing change at runtime when the user saves a new config —
   *  the consumer pokes the bridge here so the resolver sees the new
   *  catalog without rebuilding the bridge. */
  refresh(deps: Partial<Pick<PublisherBridgeDeps, "sources" | "computeRoyalty">>): void
}

// ── Bridge factory ─────────────────────────────────────────────────────────

export function createPublisherBridge(deps: PublisherBridgeDeps): PublisherBridge {
  let { emit, sources, computeRoyalty } = deps

  // Per-tool-call dispatch info, populated at tool-call-start, consumed and
  // deleted at tool-result. Mirrors orchestrator's toolDispatchRef.
  const toolDispatch = new Map<string, DispatchEntry>()

  // Session-wide `entry_id → dataset_id` cache. Populated from any tool
  // result that carries both ids; used by `get_entry_*` follow-ups whose
  // own payload lacks the dataset.
  const entryToDataset = new Map<number, number>()

  // Cluster_id → AvailableCluster lookup, rebuilt whenever sources change so
  // tool-result can attribute a dataset_id back to its owning cluster.
  let datasetToCluster = new Map<number, { clusterId: number; clusterName: string }>()
  function rebuildDatasetIndex(): void {
    const next = new Map<number, { clusterId: number; clusterName: string }>()
    if (sources) {
      for (const cluster of sources.clusters) {
        for (const dataset of cluster.datasets) {
          next.set(dataset.id, { clusterId: cluster.cluster_id, clusterName: cluster.name })
        }
      }
    }
    datasetToCluster = next
  }
  rebuildDatasetIndex()

  // Per-turn book-keeping for Mode A cost-breakdown brick replay. Reset on
  // every `message-start`.
  let liveSettledToolUseIds = new Set<string>()
  let lastJobId: number | null = null

  // ── DemoEvent emission helpers ─────────────────────────────────────────

  function buildAttributionRows(
    meta: {
      clusterIds: number[]
      datasetIds: number[]
      entriesPerDataset?: Record<number, number>
    },
    fallbackLabel: string,
  ): ToolResultEvent["attributionRows"] {
    const entriesPerDataset = meta.entriesPerDataset ?? {}
    const byCluster = new Map<
      number,
      { name: string; datasetIds: number[]; royaltyEur: number }
    >()
    for (const cid of meta.clusterIds) {
      const cat = sources?.clusters.find((c) => c.cluster_id === cid)
      if (!byCluster.has(cid)) {
        byCluster.set(cid, {
          name: cat?.name ?? `cluster ${cid}`,
          datasetIds: [],
          royaltyEur: 0,
        })
      }
    }
    for (const did of meta.datasetIds) {
      const link = datasetToCluster.get(did)
      const cid = link?.clusterId ?? meta.clusterIds[0] ?? -1
      const name =
        link?.clusterName ??
        sources?.clusters.find((c) => c.cluster_id === cid)?.name ??
        (cid === -1 ? fallbackLabel : `cluster ${cid}`)
      const bucket = byCluster.get(cid) ?? { name, datasetIds: [], royaltyEur: 0 }
      bucket.datasetIds.push(did)
      const { royaltyEur: pricePerHit } = computeRoyalty(
        "dataset_id_only",
        { dataset_ids: [did] },
        "dataset",
      )
      const hitCount = entriesPerDataset[did] ?? 0
      bucket.royaltyEur = round4(bucket.royaltyEur + pricePerHit * hitCount)
      byCluster.set(cid, bucket)
    }
    return Array.from(byCluster.entries())
      .filter(([cid]) => cid >= 0)
      .map(([cid, b]) => ({
        attributionKey: `cluster:${cid}`,
        attributionLabel: b.name,
        clusterId: cid,
        royaltyEur: b.royaltyEur,
        datasetIds: b.datasetIds,
      }))
  }

  function onToolCallStart(toolUseId: string, toolName: string): void {
    const source = resolveToolSource(sources, toolName)
    let kind: "dataset" | "api"
    let attributionKey: string
    let attributionLabel: string
    let connectorId: number | null = null
    if (source?.kind === "dataset") {
      kind = "dataset"
      attributionKey = `cluster:${source.cluster.cluster_id}`
      attributionLabel = source.cluster.name
    } else if (source?.kind === "api") {
      kind = "api"
      attributionKey = `connector:${source.connector.connector_id}`
      attributionLabel = source.connector.name
      connectorId = source.connector.connector_id
    } else {
      kind = "dataset"
      attributionKey = `tool:${toolName}`
      attributionLabel = toolName
    }
    const entry: DispatchEntry = {
      toolUseId,
      toolName,
      args: null,
      kind,
      attributionKey,
      attributionLabel,
      connectorId,
    }
    toolDispatch.set(toolUseId, entry)
    const ev: ToolCallEvent = {
      type: "tool-call",
      toolUseId,
      toolName,
      args: null,
      kind,
      connectorId,
      attributionKey,
      attributionLabel,
      tokensEstimate: 0,
      timestamp: Date.now(),
    }
    emit(ev)
  }

  function onToolCallEnd(
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): void {
    // Patch args on the stashed dispatch — the result-side handler reads them
    // for entry-id + composite-id recovery.
    const existing = toolDispatch.get(toolUseId)
    if (existing) {
      existing.args = input
    } else {
      // Defensive: tool-call-end without a preceding start. Mint a stub so
      // tool-result still has something to look up.
      onToolCallStart(toolUseId, toolName)
      const stub = toolDispatch.get(toolUseId)
      if (stub) stub.args = input
    }
  }

  function onToolResult(toolUseId: string, content: unknown, isError: boolean): void {
    // Keep the dispatch entry around even after the tool settles — the chat
    // panel adapter still needs `getAttribution(toolUseId)` to label settled
    // tool cards with their cluster/connector name. Entries are cleared on
    // `reset()`.
    const dispatch = toolDispatch.get(toolUseId)
    if (dispatch) liveSettledToolUseIds.add(toolUseId)

    let rows: ToolResultEvent["attributionRows"]
    let hits: number

    if (isError) {
      rows = []
      hits = 0
    } else if (dispatch?.kind === "api" && dispatch.connectorId !== null) {
      // API tools: live emit at €0; the platform breakdown is the source of
      // truth and merges additively via the attribution panel.
      const { royaltyEur } = computeRoyalty(dispatch.toolName, null, "api")
      rows = [
        {
          attributionKey: `connector:${dispatch.connectorId}`,
          attributionLabel: dispatch.attributionLabel,
          clusterId: null,
          royaltyEur,
          datasetIds: [],
        },
      ]
      hits = 1
    } else if (content !== undefined && content !== null) {
      const meta = extractResultMeta(content)
      for (const [eid, did] of Object.entries(meta.entryToDataset)) {
        entryToDataset.set(Number(eid), did)
      }
      const composite = parseCompositeEntryArg(dispatch?.args ?? null)
      if (meta.datasetIds.length === 0 && composite !== null) {
        entryToDataset.set(composite.entryId, composite.datasetId)
        const synthetic = {
          clusterIds: [composite.clusterId],
          datasetIds: [composite.datasetId],
          entriesPerDataset: { [composite.datasetId]: 1 },
        }
        rows = buildAttributionRows(synthetic, dispatch?.toolName ?? "tool")
        hits = 1
      } else if (meta.datasetIds.length === 0) {
        const requestedEntryId = extractEntryIdArg(dispatch?.args ?? null)
        const did = requestedEntryId !== null ? entryToDataset.get(requestedEntryId) : undefined
        if (did !== undefined) {
          const synthetic = {
            clusterIds: meta.clusterIds,
            datasetIds: [did],
            entriesPerDataset: { [did]: 1 },
          }
          rows = buildAttributionRows(synthetic, dispatch?.toolName ?? "tool")
          hits = 1
        } else if (meta.entryIds.length > 0 || requestedEntryId !== null) {
          const label = dispatch?.toolName ?? "tool"
          rows = [
            {
              attributionKey: `tool:${label}`,
              attributionLabel: label,
              clusterId: null,
              royaltyEur: 0.01,
              datasetIds: [],
            },
          ]
          hits = 1
        } else {
          rows = buildAttributionRows(meta, dispatch?.toolName ?? "tool")
          hits = sumEntries(meta.entriesPerDataset)
        }
      } else {
        rows = buildAttributionRows(meta, dispatch?.toolName ?? "tool")
        hits = sumEntries(meta.entriesPerDataset)
      }
    } else {
      // alienSDK: tool-result lands but content is `null` (the platform
      // didn't echo a body back through the responses stream). The
      // cost-breakdown brick replay path picks these up at end-of-turn.
      rows = []
      hits = 0
    }

    const totalRoyalty = isError ? 0 : rows.reduce((sum, r) => round4(sum + r.royaltyEur), 0)
    const snippet = content !== undefined && content !== null ? snippetForDisplay(content) : ""
    const ev: ToolResultEvent = {
      type: "tool-result",
      toolUseId,
      toolName: dispatch?.toolName ?? "",
      callTimestamp: Date.now(),
      attributionRows: isError ? [] : rows,
      royaltyEur: totalRoyalty,
      hits: isError ? 0 : hits,
      resultSnippet: snippet,
      isError,
    }
    emit(ev)
  }

  /**
   * Replay the platform's per-job cost breakdown into the royalty cascade.
   * Asymmetric handling preserves the live-settle semantics:
   *
   *   - connector bricks: breakdown is authoritative (live emit was €0)
   *   - dataset bricks: live cascade is authoritative when any tool settled
   *     with content during the turn — suppress those bricks
   *   - llm / compute / platform: ignored (no source attribution)
   */
  function onCostBreakdown(jobId: number, status: string, bricks: CostBrick[]): void {
    if (status !== "complete" && status !== "partial") return
    const liveSettleHappened = liveSettledToolUseIds.size > 0
    for (const brick of bricks) {
      if (brick.cost_eur === 0) continue
      if (liveSettleHappened && brick.category === "dataset") continue
      if (brick.category === "connector") {
        const u = brick.units ?? {}
        const connectorId =
          typeof u.connector_id === "number" || typeof u.connector_id === "string"
            ? String(u.connector_id)
            : brick.node_id
        const label =
          typeof u.tool_name === "string" && u.tool_name.length > 0
            ? u.tool_name
            : `connector ${connectorId}`
        emit({
          type: "tool-result",
          toolUseId: `brick:${brick.id}`,
          toolName: label,
          callTimestamp: Date.now(),
          attributionRows: [
            {
              attributionKey: `connector:${connectorId}`,
              attributionLabel: label,
              clusterId: null,
              royaltyEur: brick.cost_eur,
              datasetIds: [],
            },
          ],
          royaltyEur: brick.cost_eur,
          hits: 1,
          resultSnippet: "",
          isError: false,
        })
      } else if (brick.category === "dataset") {
        // Reached only when no live settle happened (e.g. an old alien backend
        // that doesn't echo tool output). Best-effort attribution via brick units.
        const u = brick.units ?? {}
        const datasetId =
          typeof u.dataset_id === "number" ? u.dataset_id : Number(u.dataset_id ?? -1)
        const link = datasetId > 0 ? datasetToCluster.get(datasetId) : null
        const clusterId = link?.clusterId ?? null
        emit({
          type: "tool-result",
          toolUseId: `brick:${brick.id}`,
          toolName: typeof u.tool_name === "string" ? u.tool_name : brick.node_id,
          callTimestamp: Date.now(),
          attributionRows: clusterId
            ? [
                {
                  attributionKey: `cluster:${clusterId}`,
                  attributionLabel: link?.clusterName ?? `cluster ${clusterId}`,
                  clusterId,
                  royaltyEur: brick.cost_eur,
                  datasetIds: datasetId > 0 ? [datasetId] : [],
                },
              ]
            : [],
          royaltyEur: brick.cost_eur,
          hits: 1,
          resultSnippet: "",
          isError: false,
        })
      }
      // llm / compute / platform bricks: skipped — handled by token usage panel
      // and infra cost is not surfaced per-source.
    }
  }

  // ── Dispatcher ─────────────────────────────────────────────────────────

  function feed(event: ChatEvent): void {
    switch (event.type) {
      case "message-start":
        liveSettledToolUseIds = new Set()
        lastJobId = null
        return
      case "tool-call-start":
        onToolCallStart(event.toolUseId, event.toolName)
        return
      case "tool-call-end":
        onToolCallEnd(event.toolUseId, event.toolName, event.input)
        return
      case "tool-result":
        onToolResult(event.toolUseId, event.content, event.isError)
        return
      case "job-id":
        lastJobId = event.jobId
        return
      case "cost-breakdown":
        onCostBreakdown(event.jobId, event.status, event.bricks)
        return
      case "usage":
        emit({
          type: "usage",
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.inputTokens + event.outputTokens,
        })
        return
      default:
        return
    }
  }

  function getAttribution(toolUseId: string): BridgeAttribution | null {
    const e = toolDispatch.get(toolUseId)
    return e
      ? {
          kind: e.kind,
          attributionKey: e.attributionKey,
          attributionLabel: e.attributionLabel,
          connectorId: e.connectorId,
        }
      : null
  }

  function reset(): void {
    toolDispatch.clear()
    entryToDataset.clear()
    liveSettledToolUseIds = new Set()
    lastJobId = null
  }

  function refresh(next: Partial<Pick<PublisherBridgeDeps, "sources" | "computeRoyalty">>): void {
    if (next.sources !== undefined) {
      sources = next.sources
      rebuildDatasetIndex()
    }
    if (next.computeRoyalty !== undefined) {
      computeRoyalty = next.computeRoyalty
    }
  }

  return { feed, getAttribution, reset, refresh }
}
