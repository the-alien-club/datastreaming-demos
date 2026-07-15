import "server-only"
// lib/openaire/client.ts
// Direct HTTP client for the hosted OpenAIRE MCP (mcp-openaire, mcp-base).
//
// Streamable-HTTP / JSON-RPC 2.0, same transport as the data-cluster MCP. It
// backs the background metadata resolver (lib/documents/resolver.ts) and the
// corpus_add DOI/id canonicalization. Two tools are used:
//   - openaire_kg_get_research_product  → dereference one product by OpenAIRE id
//   - openaire_kg_search_research_products → resolve a DOI (or batch of ids) to
//     the canonical product(s)
//
// Auth: opaque service Bearer token (OPENAIRE_MCP_TOKEN). The mcp-base layer
// fronts the public Graph API.
//
// The MCP wraps tool payloads twice: JSON-RPC `result.content[0].text` holds a
// JSON string, which itself is the mcp-base envelope `{ success, data|error }`.
// For get: data is the product. For search: data is `{ header, results[] }`.

import {
  MCP_CLIENT_NAME,
  MCP_CLIENT_VERSION,
  MCP_PROTOCOL_VERSION,
  OPENAIRE_MCP_RETRY_ATTEMPTS,
  OPENAIRE_MCP_RETRY_BASE_MS,
  OPENAIRE_MCP_RETRY_CAP_MS,
  OPENAIRE_MCP_TIMEOUT_MS,
  OPENAIRE_RESOLVE_CONCURRENCY,
} from "@/lib/constants"
import { requireMcpEnv } from "@/lib/env"
import { withTimeout } from "@/lib/mcp/abort"
import { McpAuthError, McpError, McpNotFoundError } from "@/lib/mcp/errors"
import { withConcurrency, withRetry } from "@/lib/mcp/retry"
import { normalizeDoi, stripEntityPrefix } from "@/lib/mcp/vocab"
import type { OaResearchProduct } from "@/lib/openaire/types"

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/** Per-id outcome from resolveIds — ordered to match the input array. */
export type ResolveResult =
  | { id: string; ok: true; product: OaResearchProduct }
  | { id: string; ok: false; error: unknown }

function isTerminal(err: unknown): boolean {
  return err instanceof McpAuthError || err instanceof McpNotFoundError
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

interface McpEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

interface SearchData {
  header?: { numFound?: number }
  results?: OaResearchProduct[]
}

interface JsonRpcOk {
  jsonrpc: "2.0"
  id: string
  result: { content?: Array<{ type: string; text: string }>; isError?: boolean }
}
interface JsonRpcErr {
  jsonrpc: "2.0"
  id: string
  error: { code: number; message: string }
}
type JsonRpcEnvelope = JsonRpcOk | JsonRpcErr

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class OpenaireClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly signal: AbortSignal | undefined
  private sessionPromise: Promise<string | null> | null = null

  constructor(opts?: { signal?: AbortSignal }) {
    const env = requireMcpEnv()
    this.baseUrl = env.OPENAIRE_MCP_URL
    this.token = env.OPENAIRE_MCP_TOKEN
    this.signal = opts?.signal
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Dereference a batch of OpenAIRE ids to full products, bounded-concurrently.
   * Results are returned in input order (one entry per id). A per-id failure is
   * captured as `{ ok: false, error }` — the batch never rejects. Mirrors the
   * old BnfDirectClient.resolveArks() contract so the resolver drainer is a
   * near-mechanical swap.
   */
  async resolveIds(ids: string[]): Promise<ResolveResult[]> {
    const settled = await withConcurrency(
      ids,
      (id) => this.getResearchProduct(stripEntityPrefix(id)),
      OPENAIRE_RESOLVE_CONCURRENCY,
    )
    return settled.map((s, i) =>
      s.ok
        ? { id: ids[i], ok: true, product: s.value }
        : { id: ids[i], ok: false, error: s.error },
    )
  }

  /** Fetch one research product by bare OpenAIRE id. Throws on failure. */
  async getResearchProduct(id: string): Promise<OaResearchProduct> {
    const env = await this.callTool<McpEnvelope<OaResearchProduct>>(
      "openaire_kg_get_research_product",
      { id },
    )
    const data = this.unwrap(env, "openaire_kg_get_research_product")
    if (!data || typeof data.id !== "string") {
      throw new McpError(`openaire_kg_get_research_product returned no product for ${id}`)
    }
    return data
  }

  /**
   * Resolve a DOI to its canonical OpenAIRE id (bare). Returns null when the DOI
   * is unknown to the Graph. Used by corpus_add to canonicalize a DOI input
   * before inserting the stub row.
   */
  async resolveDoi(doi: string): Promise<string | null> {
    const bare = normalizeDoi(doi)
    if (!bare) return null
    const env = await this.callTool<McpEnvelope<SearchData>>(
      "openaire_kg_search_research_products",
      { pid: [bare], pageSize: 1 },
    )
    const data = this.unwrap(env, "openaire_kg_search_research_products")
    const first = data.results?.[0]
    return first && typeof first.id === "string" ? stripEntityPrefix(first.id) : null
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private unwrap<T>(env: McpEnvelope<T>, tool: string): T {
    if (!env.success) {
      throw new McpError(`${tool} failed: ${env.error ?? "unknown error"}`)
    }
    if (env.data === undefined) {
      throw new McpError(`${tool} returned success but no data`)
    }
    return env.data
  }

  private ensureSession(): Promise<string | null> {
    if (!this.sessionPromise) this.sessionPromise = this.openSession()
    return this.sessionPromise
  }

  private async openSession(): Promise<string | null> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: MCP_CLIENT_NAME, version: MCP_CLIENT_VERSION },
        },
      }),
      signal: withTimeout(this.signal, OPENAIRE_MCP_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) {
      throw new McpAuthError(`OpenAIRE MCP initialize auth failed (HTTP ${res.status})`)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new McpError(
        `OpenAIRE MCP initialize failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      )
    }
    // Stateless mcp-base → no header; that's fine, callers omit it.
    return res.headers.get("mcp-session-id")
  }

  private async callTool<T>(name: string, args: unknown): Promise<T> {
    return withRetry(
      async () => {
        const id = crypto.randomUUID()
        const sessionId = await this.ensureSession()
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.token}`,
        }
        if (sessionId) headers["Mcp-Session-Id"] = sessionId

        const res = await fetch(this.baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args },
          }),
          signal: withTimeout(this.signal, OPENAIRE_MCP_TIMEOUT_MS),
        })

        if (res.status === 401 || res.status === 403) {
          throw new McpAuthError(`OpenAIRE MCP auth failed (HTTP ${res.status}) calling ${name}`)
        }
        if (res.status === 404) {
          throw new McpNotFoundError(`OpenAIRE MCP returned 404 for tool ${name}`)
        }
        if (res.status === 400) {
          // Likely a stale session — drop it so the retry re-initializes.
          this.sessionPromise = null
          const body = await res.text().catch(() => "")
          throw new McpError(`OpenAIRE MCP HTTP 400 calling ${name}: ${body.slice(0, 200)}`)
        }
        if (!res.ok) {
          throw new McpError(`OpenAIRE MCP HTTP ${res.status} calling ${name}`)
        }

        const ct = res.headers.get("content-type") ?? ""
        let envelope: JsonRpcEnvelope
        if (ct.includes("text/event-stream")) {
          const text = await res.text()
          const dataLine = text.split("\n").find((l) => l.startsWith("data: "))
          if (!dataLine) {
            throw new McpError(`OpenAIRE MCP SSE response had no data line for ${name}`)
          }
          envelope = JSON.parse(dataLine.slice(6)) as JsonRpcEnvelope
        } else {
          envelope = (await res.json()) as JsonRpcEnvelope
        }

        if ("error" in envelope) {
          throw new McpError(`OpenAIRE MCP JSON-RPC error for ${name}: ${envelope.error.message}`)
        }
        const contentText = envelope.result?.content?.[0]?.text
        if (envelope.result?.isError) {
          throw new McpError(`OpenAIRE MCP tool ${name} failed: ${contentText ?? "(no message)"}`)
        }
        if (typeof contentText !== "string") {
          throw new McpError(`OpenAIRE MCP returned no text content for ${name}`)
        }
        return JSON.parse(contentText) as T
      },
      {
        attempts: OPENAIRE_MCP_RETRY_ATTEMPTS,
        baseMs: OPENAIRE_MCP_RETRY_BASE_MS,
        capMs: OPENAIRE_MCP_RETRY_CAP_MS,
        isTerminal,
      },
    )
  }
}
