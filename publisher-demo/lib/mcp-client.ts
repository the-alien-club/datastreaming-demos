/**
 * Minimal JSON-RPC client for mcp-alien. Used by the Mode B agent loop to:
 *   - discover available tools (`tools/list`)
 *   - execute a tool on the agent's behalf (`tools/call`)
 *
 * We avoid the full `@modelcontextprotocol/sdk` because we only need two
 * methods, and the demo's MCP server accepts plain JSON-RPC over HTTP POST.
 * Auth is via Bearer ADMIN_OAT + x-organization-id pinning — both supported
 * now that we run the HTTP call ourselves (the Anthropic MCP connector only
 * allowed the Bearer token, no custom headers).
 *
 * The MCP server responds either with `application/json` or `text/event-stream`
 * depending on what the underlying FastMCP route does today. We accept both
 * and unwrap the inner JSON-RPC payload.
 */

import { env } from "./env"

interface JsonRpcOk<T = unknown> {
  jsonrpc: "2.0"
  id: number | string
  result: T
}
interface JsonRpcErr {
  jsonrpc: "2.0"
  id: number | string
  error: { code: number; message: string; data?: unknown }
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpToolCallResult {
  /** MCP `tools/call` returns content blocks (usually `{type:"text", text}`). */
  content: Array<Record<string, unknown>>
  isError: boolean
}

let nextId = 1
const baseHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${env.ADMIN_OAT}`,
  "x-organization-id": env.ORG_ID,
})

function mcpUrl(configSlug: string): string {
  return `${env.MCP_ALIEN_URL.replace(/\/$/, "")}/mcp?config=${configSlug}`
}

async function rpc<T>(
  configSlug: string,
  method: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const id = nextId++
  const res = await fetch(mcpUrl(configSlug), {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const ctype = res.headers.get("content-type") ?? ""
  let envelope: JsonRpcOk<T> | JsonRpcErr
  if (ctype.includes("text/event-stream")) {
    // FastMCP sometimes wraps a single response as one SSE frame. Read the
    // body, find the first `data:` line, parse its JSON payload.
    const body = await res.text()
    const dataLine = body
      .split("\n")
      .find((line) => line.startsWith("data: "))
    if (!dataLine) {
      throw new Error(`MCP ${method}: SSE response had no data line`)
    }
    envelope = JSON.parse(dataLine.slice(6)) as JsonRpcOk<T> | JsonRpcErr
  } else {
    envelope = (await res.json()) as JsonRpcOk<T> | JsonRpcErr
  }
  if ("error" in envelope) {
    throw new Error(`MCP ${method}: ${envelope.error.message}`)
  }
  return envelope.result
}

/**
 * `tools/list` returns the catalog the MCP server will accept calls for.
 * Returned tools are mapped to Anthropic's `Tool` shape (name, description,
 * input_schema) by the caller.
 */
export async function listMcpTools(
  configSlug: string,
  signal?: AbortSignal,
): Promise<McpToolInfo[]> {
  const result = await rpc<{ tools: Array<Record<string, unknown>> }>(
    configSlug,
    "tools/list",
    undefined,
    signal,
  )
  return (result.tools ?? []).map((t) => ({
    name: String(t.name),
    description: typeof t.description === "string" ? t.description : undefined,
    inputSchema:
      (t.inputSchema as Record<string, unknown>) ??
      ({ type: "object", properties: {} } as Record<string, unknown>),
  }))
}

/**
 * Execute a tool. Maps the JSON-RPC result envelope into a shape suitable for
 * Anthropic's `tool_result` content block (`{content, is_error}`).
 */
export async function callMcpTool(
  configSlug: string,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<McpToolCallResult> {
  try {
    const result = await rpc<{
      content?: Array<Record<string, unknown>>
      isError?: boolean
    }>(
      configSlug,
      "tools/call",
      { name, arguments: args },
      signal,
    )
    return {
      content: result.content ?? [{ type: "text", text: "(no content)" }],
      isError: result.isError === true,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    }
  }
}
