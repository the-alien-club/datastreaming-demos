// Agent SDK query wrapper — replaces claude-process.ts CLI orchestration.
// Configures MCP servers, system prompt, and subagent support via SDK query().

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage, McpServerConfig, AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { getSystemPrompt } from './system-prompt';
import path from 'path';

// Built-in tools that must never be available — hard-denied at runtime via canUseTool
const BLOCKED_TOOLS_LIST = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'ToolSearch', 'NotebookEdit',
];
const BLOCKED_TOOLS = new Set(BLOCKED_TOOLS_LIST);

// Tools available to both the main agent and subagents (no Bash/Read/Write/Edit/Glob/Grep)
const RESEARCH_TOOLS = [
  // OpenAIRE MCP tools (explicit — no wildcards)
  'mcp__openaire-local__search_research_products',
  'mcp__openaire-local__get_research_product_details',
  'mcp__openaire-local__get_citation_network',
  'mcp__openaire-local__search_organizations',
  'mcp__openaire-local__search_projects',
  'mcp__openaire-local__get_author_profile',
  'mcp__openaire-local__search_datasets',
  'mcp__openaire-local__analyze_coauthorship_network',
  'mcp__openaire-local__get_project_outputs',
  'mcp__openaire-local__find_by_influence_class',
  'mcp__openaire-local__find_by_popularity_class',
  'mcp__openaire-local__find_by_impulse_class',
  'mcp__openaire-local__find_by_citation_count_class',
  'mcp__openaire-local__explore_research_relationships',
  'mcp__openaire-local__search_data_sources',
  'mcp__openaire-local__analyze_research_trends',
  'mcp__openaire-local__build_subgraph_from_dois',
  'mcp__openaire-local__search_persons',
  'mcp__openaire-local__get_person',
  'mcp__openaire-local__get_organization',
  'mcp__openaire-local__get_project',
  'mcp__openaire-local__get_data_source',
  'mcp__openaire-local__get_research_links',
  'mcp__openaire-local__get_relationship_types',
  'mcp__openaire-local__discover_by_subject',
  'mcp__openaire-local__discover_by_coauthors',
  // Visualization tools (explicit)
  'mcp__viz-tools__create_citation_network_chart',
  'mcp__viz-tools__create_timeline_chart',
  'mcp__viz-tools__create_distribution_chart',
  'mcp__viz-tools__merge_citation_networks',
];

/**
 * Build MCP server configs for the SDK query.
 * - openaire-local: HTTP (remote) or stdio (local fallback)
 * - viz-tools: always stdio
 */
function buildMcpServers(accessToken?: string): Record<string, McpServerConfig> {
  const vizMcpPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');

  const servers: Record<string, McpServerConfig> = {
    'viz-tools': {
      command: 'node',
      args: [vizMcpPath],
    },
  };

  const openaireMcpUrl = process.env.OPENAIRE_MCP_URL;
  if (openaireMcpUrl) {
    // Remote HTTP MCP with optional Bearer token
    const config: Record<string, any> = {
      type: 'http',
      url: openaireMcpUrl,
    };
    if (accessToken) {
      config.headers = { Authorization: `Bearer ${accessToken}` };
    }
    servers['openaire-local'] = config as McpServerConfig;
    console.log(`[agent] Remote MCP: ${openaireMcpUrl} (auth: ${accessToken ? 'yes' : 'no'})`);
  } else {
    // Standalone: embedded MCP server via stdio
    const mcpPath = path.join(process.cwd(), '..', 'mcp', 'dist', 'index.js');
    servers['openaire-local'] = {
      command: 'node',
      args: [mcpPath],
    };
    console.log(`[agent] Local MCP: ${mcpPath}`);
  }

  return servers;
}

/**
 * Build MCP server specs for subagents (serializable — no instances).
 * AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>
 */
function buildSubagentMcpServers(accessToken?: string): Array<Record<string, any>> {
  const vizMcpPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');
  const specs: Array<Record<string, any>> = [];

  // viz-tools — always stdio
  specs.push({
    'viz-tools': {
      command: 'node',
      args: [vizMcpPath],
    },
  });

  // openaire-local — HTTP or stdio depending on env
  const openaireMcpUrl = process.env.OPENAIRE_MCP_URL;
  if (openaireMcpUrl) {
    const config: Record<string, any> = {
      type: 'http',
      url: openaireMcpUrl,
    };
    if (accessToken) {
      config.headers = { Authorization: `Bearer ${accessToken}` };
    }
    specs.push({ 'openaire-local': config });
  } else {
    const mcpPath = path.join(process.cwd(), '..', 'mcp', 'dist', 'index.js');
    specs.push({
      'openaire-local': {
        command: 'node',
        args: [mcpPath],
      },
    });
  }

  return specs;
}

/**
 * Build subagent definitions — restricts tools and propagates MCP servers.
 */
function buildAgents(accessToken?: string): Record<string, AgentDefinition> {
  const mcpSpecs = buildSubagentMcpServers(accessToken);

  return {
    'subagent': {
      description: 'Subagent with the same tools and MCP servers as the parent',
      prompt: 'Your MCP tools are available directly. Do NOT use ToolSearch — call tools by name.',
      tools: RESEARCH_TOOLS,
      mcpServers: mcpSpecs,
      model: 'inherit',
    },
  };
}

/**
 * Start an Agent SDK query. Returns an async iterable of SDK messages.
 *
 * - Loads the system prompt from SKILL.md
 * - Configures MCP servers with optional auth
 * - Enables the Agent tool for autonomous subagent delegation
 * - Supports session resumption for multi-turn conversations
 */
export function startQuery(
  messages: any[],
  model: string,
  accessToken?: string,
  resumeSessionId?: string | null,
) {
  const systemPrompt = getSystemPrompt();
  const mcpServers = buildMcpServers(accessToken);

  const agents = buildAgents(accessToken);

  const queryOptions: Record<string, any> = {
    model,
    systemPrompt,
    mcpServers,
    // Hard enforcement layer 1: only Agent as built-in tool
    tools: ['Agent'],
    // Hard enforcement layer 2: remove blocked tools from model's context
    disallowedTools: BLOCKED_TOOLS_LIST,
    // Auto-approve MCP tools + Agent without permission prompts
    allowedTools: [
      ...RESEARCH_TOOLS,
      'Agent',
    ],
    // Hard enforcement layer 3: runtime gate — denies blocked tools and
    // rejects Agent calls that don't use subagent_type: "subagent"
    canUseTool: async (
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      // Block dangerous built-in tools
      if (BLOCKED_TOOLS.has(toolName)) {
        console.log(`[security] DENIED tool: ${toolName}`);
        return { result: 'deny', reason: 'Tool not available in this environment' };
      }
      // Force all subagents through the restricted "subagent" definition
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

  // Prompt iterator — only send latest user message (SDK loads history via resume)
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
  return query({ prompt: createPrompt(), options: queryOptions });
}
