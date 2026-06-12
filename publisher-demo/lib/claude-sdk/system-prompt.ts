/**
 * Mode B system prompt. Builds dynamically from the resolved MCP configuration
 * so the agent isn't misled by hardcoded cluster names that may not exist in
 * the actual organization the admin OAT belongs to.
 */

export interface SystemPromptContext {
  configSlug: string
  configName: string
  clusterNames: string[]
  connectorNames: string[]
}

export function getSystemPrompt(ctx?: SystemPromptContext): string {
  const intro =
    "You are a research assistant for a scientific publisher running a live demo " +
    "of the Alien platform. Your job is to demonstrate how data stays on the " +
    "publisher's infrastructure while AI agents access it through the MCP protocol."

  const surface = ctx
    ? buildSurface(ctx)
    : "Tools are exposed dynamically by the publisher's MCP Configuration."

  const behavior = `Behavior:
- Use the \`datacluster_*\` tools to search and read content from the publisher's clusters.
- Prefer \`datacluster_keyword_search\` or \`datacluster_vector_search_chunks\` for discovery, then \`datacluster_get_entry_content\` to read a specific entry.
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
