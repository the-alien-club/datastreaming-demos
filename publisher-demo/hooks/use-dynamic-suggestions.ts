"use client"

/**
 * Hook that owns the chip-row prompts: builds a compact snapshot of the
 * connected MCP sources, ships it to `/api/demo/suggestions` together with a
 * memo of the current conversation, and exposes the three returned prompts.
 *
 * Regeneration triggers:
 *   - The MCP config becomes available (initial mount).
 *   - `turnCounter` bumps (a turn just finished — the orchestrator owns this).
 *   - The connected sources or mode change.
 *
 * It never fires during streaming, debounces bursty triggers (250ms), and
 * aborts any in-flight call when a new trigger arrives. On error / empty
 * config the chip row shows nothing — no hard-coded fallback prompts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ConfigView } from "@/hooks/use-config"
import type { Mode } from "@/hooks/use-mode"
import type {
  SuggestionsErrorBody,
  SuggestionsMcpSnapshot,
  SuggestionsRequest,
  SuggestionsResponse,
} from "@/lib/suggestions/types"

export type SuggestionsStatus = "idle" | "loading" | "ready" | "error"

export interface UseDynamicSuggestionsArgs {
  mode: Mode
  view: ConfigView | null
  memo: string | null
  /** Bumps on every assistant turn end — the orchestrator owns this counter. */
  turnCounter: number
  /** True while any agent message is streaming; the hook pauses regeneration. */
  isStreaming: boolean
  /** Per-suggestion character cap. Mobile passes a tighter value. */
  lengthHint?: number
}

export interface UseDynamicSuggestionsResult {
  suggestions: string[]
  status: SuggestionsStatus
  error: string | null
}

const DEBOUNCE_MS = 250
const SAMPLE_DATASET_NAMES = 4

export function useDynamicSuggestions({
  mode,
  view,
  memo,
  turnCounter,
  isStreaming,
  lengthHint,
}: UseDynamicSuggestionsArgs): UseDynamicSuggestionsResult {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [status, setStatus] = useState<SuggestionsStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  // Build the snapshot from the *checked* picker view. Memoised on view+mode
  // so the snapshot itself is referentially stable across re-renders — only
  // changes that actually affect the prompt invalidate the effect.
  const snapshot = useMemo<SuggestionsMcpSnapshot | null>(() => {
    if (!view) return null
    const clusters = view.clusters
      .map((c) => {
        const checkedDatasets = c.datasets.filter((d) => d.checked)
        if (checkedDatasets.length === 0) return null
        return {
          cluster_id: c.cluster_id,
          name: c.name,
          description: c.description,
          datasetCount: checkedDatasets.length,
          sampleDatasetNames: checkedDatasets.slice(0, SAMPLE_DATASET_NAMES).map((d) => d.name),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    const externalApis = view.externalApis
      .filter((a) => a.checked)
      .map((a) => ({
        connector_id: a.connector_id,
        name: a.name,
        description: a.description,
      }))
    return { clusters, externalApis }
  }, [view])

  const inflightRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<number | null>(null)

  const cancel = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (inflightRef.current) {
      inflightRef.current.abort()
      inflightRef.current = null
    }
  }, [])

  useEffect(() => {
    // `turnCounter` is read here only so the effect re-runs on every turn — it
    // would otherwise be considered "unused" by the exhaustive-deps lint, even
    // though bumping it is the orchestrator's only way to ask for regeneration.
    void turnCounter
    if (!snapshot) return
    // Empty config: clear the chip row, no fetch.
    if (snapshot.clusters.length === 0 && snapshot.externalApis.length === 0) {
      cancel()
      setSuggestions([])
      setStatus("idle")
      setError(null)
      return
    }
    // Don't fight a live stream — wait for `onStreamEnd` to bump turnCounter.
    if (isStreaming) return

    cancel()
    debounceRef.current = window.setTimeout(() => {
      const ctrl = new AbortController()
      inflightRef.current = ctrl
      setStatus("loading")
      setError(null)

      const body: SuggestionsRequest = {
        mode,
        mcpSnapshot: snapshot,
        memo,
        ...(typeof lengthHint === "number" ? { lengthHint } : {}),
      }

      fetch("/api/demo/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const errBody = (await res.json().catch(() => null)) as SuggestionsErrorBody | null
            throw new Error(errBody?.message ?? `HTTP ${res.status}`)
          }
          return (await res.json()) as SuggestionsResponse
        })
        .then((data) => {
          if (ctrl.signal.aborted) return
          setSuggestions(data.suggestions)
          setStatus("ready")
          setError(null)
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          if (err instanceof Error && err.name === "AbortError") return
          setStatus("error")
          setError(err instanceof Error ? err.message : String(err))
          setSuggestions([])
        })
        .finally(() => {
          if (inflightRef.current === ctrl) inflightRef.current = null
        })
    }, DEBOUNCE_MS)

    return cancel
  }, [mode, memo, turnCounter, isStreaming, snapshot, lengthHint, cancel])

  // Cancel any in-flight call when the component unmounts.
  useEffect(() => cancel, [cancel])

  return { suggestions, status, error }
}
