/**
 * Chat route — powered by `@alien/chat-sdk` since the v0.3 migration.
 *
 * Both modes are wired through `createChatHandler`:
 *
 *   - claude  → claudeSDK runner. Tools come from the per-browser MCP
 *               configuration (mcp-alien server) prefixed with `alien__`,
 *               so the model sees `alien__datacluster_keyword_search`, etc.
 *               No demo-defined custom tools (yet) — keep that option open
 *               via `createToolRegistry({ tools: [...] })` later.
 *
 *   - alien   → alienSDK runner against the platform's agentic workflow.
 *               The per-browser slug + MCP url ride through `extraFields`
 *               so the workflow's mcpServer nodes resolve dynamically.
 *
 * Per-request work:
 *   1. Resolve (or create) the per-browser MCP configuration from the
 *      `x-demo-config-slug` header. Same logic as before — just moved
 *      into the tool-registry / extra-fields builders.
 *   2. For claude: build a SystemPromptContext from the resolved sources
 *      so the model knows which clusters/connectors it can hit.
 *
 * The route is intentionally thin: no streaming logic, no NDJSON parsing,
 * no UI-chunk translation. All of that now lives in the SDK.
 */
import {
  createToolRegistry,
  type McpServerConfig,
  type ToolRegistry,
} from "@alien/chat-sdk/claude"
import { createChatHandler } from "@alien/chat-sdk/next"
import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { adminFetch } from "@/lib/platform/admin-fetch"
import { getOrCreateUserConfig } from "@/lib/platform/per-user-config"

interface SystemPromptContext {
  configSlug: string
  configName: string
  clusterNames: string[]
  connectorNames: string[]
}

/**
 * Dynamic Claude system prompt that names the clusters / connectors the
 * resolved MCP configuration actually exposes, so the model doesn't hallucinate
 * cluster names that aren't in this org's catalog.
 */
function buildSystemPrompt(ctx?: SystemPromptContext): string {
  const intro =
    "You are a research assistant for a scientific publisher running a live demo " +
    "of the Alien platform. Your job is to demonstrate how data stays on the " +
    "publisher's infrastructure while AI agents access it through the MCP protocol."
  const surface = ctx
    ? buildSurface(ctx)
    : "Tools are exposed dynamically by the publisher's MCP Configuration."
  const behavior = `Behavior:
- Use the \`alien__datacluster_*\` tools to search and read content from the publisher's clusters.
- Prefer \`alien__datacluster_keyword_search\` or \`alien__datacluster_vector_search_chunks\` for discovery, then \`alien__datacluster_get_entry_content\` to read a specific entry.
- For external sources (Crossref, ORCID, etc.), call the connector's MCP tool by name (the catalog includes their schemas).
- Never invent results. If a tool returns nothing, say so plainly.
- Keep answers concise — the demo UI is tight and long answers don't fit.`
  return [intro, "", surface, "", behavior].join("\n")
}

function buildSurface(ctx: SystemPromptContext): string {
  const lines: string[] = [
    `MCP Configuration in scope: \`${ctx.configSlug}\` ("${ctx.configName}").`,
  ]
  if (ctx.clusterNames.length > 0) {
    lines.push(`Data clusters available: ${ctx.clusterNames.join(", ")}.`)
  } else {
    lines.push("No data clusters available in this configuration.")
  }
  if (ctx.connectorNames.length > 0) {
    lines.push(`Proxied external APIs: ${ctx.connectorNames.join(", ")}.`)
  } else {
    lines.push("No external APIs registered for this configuration.")
  }
  return lines.join("\n")
}

const CONFIG_SLUG_HEADER = "x-demo-config-slug"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T } | T
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data
  }
  return json as T
}

/** Per-request claude system prompt built from the resolved MCP catalog. */
async function buildClaudeSystem(request: Request): Promise<string> {
  const configSlug = request.headers.get(CONFIG_SLUG_HEADER)
  const resolved = await getOrCreateUserConfig(configSlug).catch(() => null)
  if (!resolved) return buildSystemPrompt()
  const sourcesRes = await adminFetch("/mcp-configurations/available-sources")
  const sources = sourcesRes.ok
    ? await unwrap<{
        clusters: Array<{ name: string }>
        external_apis: Array<{ name: string }>
      }>(sourcesRes)
    : { clusters: [], external_apis: [] }
  return buildSystemPrompt({
    configSlug: resolved.slug,
    configName: resolved.configuration.name,
    clusterNames: sources.clusters.map((c) => c.name),
    connectorNames: sources.external_apis.map((a) => a.name),
  })
}

/**
 * Build the claude tool registry for THIS request. The mcp-alien server URL
 * carries the per-browser config slug as a query param so each session sees
 * its own catalog. Throws if config resolution fails (the handler bubbles
 * that as a stream error event).
 */
async function buildClaudeTools(request: Request): Promise<ToolRegistry> {
  const configSlug = request.headers.get(CONFIG_SLUG_HEADER)
  const resolved = await getOrCreateUserConfig(configSlug)
  const mcpBase = env.MCP_ALIEN_URL.replace(/\/$/, "")
  const alienMcp: McpServerConfig = {
    name: "alien",
    url: `${mcpBase}/mcp?config=${resolved.slug}`,
    headers: {
      Authorization: `Bearer ${env.ADMIN_OAT}`,
      "x-organization-id": env.ORG_ID,
    },
  }
  return createToolRegistry({ mcpServers: [alienMcp] })
}

export async function POST(request: Request): Promise<Response> {
  // Resolve config + build per-request configs before delegating to the SDK,
  // so a config-resolution failure returns a structured 503 (the same way
  // the old route did) rather than blowing up mid-stream.
  let claudeTools: ToolRegistry
  let claudeSystem: string
  let alienExtraFields: () => Promise<Record<string, unknown>>
  try {
    const [tools, system] = await Promise.all([
      buildClaudeTools(request),
      buildClaudeSystem(request),
    ])
    claudeTools = tools
    claudeSystem = system
    // Alien `extra_fields` resolves per-request — pull the configSlug from
    // the SAME resolver so claude + alien share the slug for this browser.
    alienExtraFields = async () => {
      const configSlug = request.headers.get(CONFIG_SLUG_HEADER)
      const resolved = await getOrCreateUserConfig(configSlug)
      const mcpBase = env.MCP_ALIEN_URL.replace(/\/$/, "")
      return {
        config_slug: resolved.slug,
        mcp_server_url: `${mcpBase}/mcp?config=${resolved.slug}`,
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "config-resolution-failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    )
  }

  const handler = createChatHandler({
    claude: {
      apiKey: env.ANTHROPIC_API_KEY,
      system: claudeSystem,
      tools: claudeTools,
    },
    alien: {
      platformBaseUrl: env.PLATFORM_API_URL,
      workflowId: env.DEMO_WORKFLOW_ID,
      accessToken: env.ADMIN_OAT,
      orgId: env.ORG_ID,
      extraFields: alienExtraFields,
    },
  })
  return handler(request)
}
