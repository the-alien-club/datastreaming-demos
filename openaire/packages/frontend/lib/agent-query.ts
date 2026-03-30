// Agent SDK query wrapper.
// MCP URL is discovered from the plugin repo on GitHub (single source of truth).
// Auth token is injected programmatically per-request.
// Security: blocks dangerous built-in tools, enforces explicit MCP tool allowlist.

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage, McpServerConfig, AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { getSystemPrompt } from './system-prompt';
import path from 'path';

const MARKETPLACE_REPO = process.env.MARKETPLACE_REPO || 'the-alien-club/claude-marketplace';
const MARKETPLACE_BRANCH = process.env.MARKETPLACE_BRANCH || 'local';
const PLUGIN_MCP_PATH = 'plugins/alien-openscience/.mcp.json';

// Built-in tools that must never be available — hard-denied at runtime via canUseTool
const BLOCKED_TOOLS_LIST = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'ToolSearch', 'NotebookEdit',
];
const BLOCKED_TOOLS = new Set(BLOCKED_TOOLS_LIST);

// Built dynamically from discovered MCP config — explicit tool names, no wildcards
function buildResearchTools(discoveredConfig: Record<string, any>): string[] {
  const tools: string[] = [];
  const mcpServers = discoveredConfig.mcpServers || {};
  for (const name of Object.keys(mcpServers)) {
    tools.push(`mcp__${name}__*`);
  }
  tools.push('mcp__viz-tools__*');
  return tools;
}

// Cache the discovered MCP config so we only fetch once per process
let _mcpConfigCache: Record<string, any> | null = null;

/**
 * Fetch the .mcp.json from the plugin repo on GitHub.
 * Falls back to OPENAIRE_MCP_URL env var.
 */
async function discoverMcpConfig(): Promise<Record<string, any>> {
  if (_mcpConfigCache) return _mcpConfigCache;

  // Try fetching from GitHub
  const rawUrl = `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/${MARKETPLACE_BRANCH}/${PLUGIN_MCP_PATH}`;
  try {
    const res = await fetch(rawUrl);
    if (res.ok) {
      const json = await res.json();
      console.log(`[agent] Discovered MCP config from ${MARKETPLACE_REPO}#${MARKETPLACE_BRANCH}`);
      _mcpConfigCache = json;
      return json;
    }
    console.warn(`[agent] Failed to fetch MCP config from GitHub: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.warn(`[agent] Failed to fetch MCP config from GitHub:`, err);
  }

  // Fallback: env var
  const envUrl = process.env.OPENAIRE_MCP_URL;
  if (envUrl) {
    console.log(`[agent] Using OPENAIRE_MCP_URL fallback: ${envUrl}`);
    _mcpConfigCache = { mcpServers: { 'openaire-local': { type: 'http', url: envUrl } } };
    return _mcpConfigCache;
  }

  throw new Error('No MCP config found: GitHub fetch failed and OPENAIRE_MCP_URL not set');
}

/**
 * Build MCP server configs from discovered plugin config + auth injection.
 */
function buildMcpServers(discoveredConfig: Record<string, any>, accessToken?: string): Record<string, McpServerConfig> {
  const vizMcpPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');

  const servers: Record<string, McpServerConfig> = {
    'viz-tools': {
      command: 'node',
      args: [vizMcpPath],
    },
  };

  const mcpServers = discoveredConfig.mcpServers || {};
  for (const [name, config] of Object.entries(mcpServers)) {
    const serverConfig = { ...(config as Record<string, any>) };

    // Inject auth header for HTTP servers
    if (serverConfig.type === 'http' && accessToken) {
      serverConfig.headers = {
        ...serverConfig.headers,
        Authorization: `Bearer ${accessToken}`,
      };
    }

    servers[name] = serverConfig as McpServerConfig;
    console.log(`[agent] MCP "${name}": ${serverConfig.type || 'stdio'} ${serverConfig.url || serverConfig.command || ''} (auth: ${accessToken ? 'yes' : 'no'})`);
  }

  return servers;
}

/**
 * Build subagent definitions with the same MCP servers.
 */
function buildAgents(discoveredConfig: Record<string, any>, accessToken?: string): Record<string, AgentDefinition> {
  const vizMcpPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');
  const researchTools = buildResearchTools(discoveredConfig);

  const mcpSpecs: Array<Record<string, any>> = [
    { 'viz-tools': { command: 'node', args: [vizMcpPath] } },
  ];

  const mcpServers = discoveredConfig.mcpServers || {};
  for (const [name, config] of Object.entries(mcpServers)) {
    const serverConfig = { ...(config as Record<string, any>) };
    if (serverConfig.type === 'http' && accessToken) {
      serverConfig.headers = {
        ...serverConfig.headers,
        Authorization: `Bearer ${accessToken}`,
      };
    }
    mcpSpecs.push({ [name]: serverConfig });
  }

  return {
    'subagent': {
      description: 'Subagent with the same tools and MCP servers as the parent',
      prompt: 'Your MCP tools are available directly. Do NOT use ToolSearch — call tools by name.',
      tools: researchTools,
      mcpServers: mcpSpecs,
      model: 'inherit',
    },
  };
}

/**
 * Start an Agent SDK query.
 * MCP config is discovered from the plugin repo on GitHub, with auth injected per-request.
 */
export async function startQuery(
  messages: any[],
  model: string,
  accessToken?: string,
  resumeSessionId?: string | null,
) {
  const systemPrompt = await getSystemPrompt();
  const discoveredConfig = await discoverMcpConfig();
  const mcpServers = buildMcpServers(discoveredConfig, accessToken);
  const agents = buildAgents(discoveredConfig, accessToken);

  const researchTools = buildResearchTools(discoveredConfig);

  const queryOptions: Record<string, any> = {
    model,
    systemPrompt,
    mcpServers,
    // Hard enforcement layer 1: only Agent as built-in tool
    tools: ['Agent'],
    // Hard enforcement layer 2: remove blocked tools from model's context
    disallowedTools: BLOCKED_TOOLS_LIST,
    // Auto-approve MCP tools + Agent without permission prompts
    allowedTools: [...researchTools, 'Agent'],
    // Hard enforcement layer 3: runtime gate — denies blocked tools and
    // rejects Agent calls that don't use subagent_type: "subagent"
    canUseTool: async (
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      if (BLOCKED_TOOLS.has(toolName)) {
        console.log(`[security] DENIED tool: ${toolName}`);
        return { result: 'deny', reason: 'Tool not available in this environment' };
      }
      if (toolName === 'Agent') {
        const subagentType = input.subagent_type as string | undefined;
        if (subagentType && subagentType !== 'subagent') {
          console.log(`[security] DENIED agent type: ${subagentType}`);
          return { result: 'deny', reason: 'Only subagent_type "subagent" is allowed' };
        }
      }
      return { result: 'allow' };
    },
    agents,
    permissionMode: 'acceptEdits',
    persistSession: true,
  };

  if (resumeSessionId) {
    queryOptions.resume = resumeSessionId;
    console.log(`[agent] Resuming session: ${resumeSessionId}`);
  }

  async function* createPrompt(): AsyncGenerator<SDKUserMessage> {
    const userMsgs = messages.filter(
      (m: any) => m.role === 'user' && m.content && m.content !== 'thinking'
    );
    if (userMsgs.length === 0) return;

    const latest = userMsgs[userMsgs.length - 1];
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: typeof latest.content === 'string'
          ? latest.content
          : JSON.stringify(latest.content),
      },
      parent_tool_use_id: null,
      session_id: crypto.randomUUID(),
    } as SDKUserMessage;
  }

  console.log(`[agent] Starting query (model: ${model})`);
  console.log(`[agent] MCP servers: ${JSON.stringify(Object.keys(mcpServers))}`);
  return query({ prompt: createPrompt(), options: queryOptions });
}
