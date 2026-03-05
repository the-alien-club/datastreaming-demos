/**
 * Tool Registration
 *
 * Registers visualization tools with the MCP server.
 * Follows the same registry pattern as mcp-openaire: each tool module
 * exports NAME, DESCRIPTION, INPUT_SCHEMA, ANNOTATIONS, and an execute function.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/index.js';

// =============================================================================
// Tool Module Imports
// =============================================================================

import * as createCitationNetworkChart from './create_citation_network_chart.js';
import * as createTimelineChart from './create_timeline_chart.js';
import * as createDistributionChart from './create_distribution_chart.js';
import * as mergeCitationNetworks from './merge_citation_networks.js';

// =============================================================================
// Tool Module Interface
// =============================================================================

interface ToolModule {
  NAME: string;
  DESCRIPTION: string;
  INPUT_SCHEMA: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  ANNOTATIONS: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  execute: (args: Record<string, any>) => Promise<string>;
}

// =============================================================================
// Tool Lists by Category
// =============================================================================

/** Chart creation tools - transform data into visual chart objects */
const CHART_TOOLS: ToolModule[] = [
  createCitationNetworkChart,
  createTimelineChart,
  createDistributionChart,
];

/** Network composition tools - merge and transform network data */
const NETWORK_TOOLS: ToolModule[] = [
  mergeCitationNetworks,
];

/** All tools combined */
const TOOLS: ToolModule[] = [
  ...CHART_TOOLS,
  ...NETWORK_TOOLS,
];

// =============================================================================
// Registration
// =============================================================================

/**
 * Register all visualization tools with the MCP server.
 *
 * Sets up both the tool listing handler and the tool call dispatcher.
 * Each tool is discovered from its module's metadata constants.
 *
 * @param server - MCP Server instance to register tools with
 */
export function registerTools(server: Server): void {
  logger.info('[VIZ-MCP] Registering tools...');

  // Build a lookup map for fast tool dispatch
  const toolMap = new Map<string, ToolModule>();
  for (const tool of TOOLS) {
    toolMap.set(tool.NAME, tool);
  }

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('Tool called', { name });

    const toolModule = toolMap.get(name);
    if (!toolModule) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await toolModule.execute(args as Record<string, any> || {});

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  });

  // Register tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS.map((tool) => ({
        name: tool.NAME,
        description: tool.DESCRIPTION,
        inputSchema: tool.INPUT_SCHEMA,
      })),
    };
  });

  // Log registration summary
  logger.info(`[VIZ-MCP] Registered ${TOOLS.length} tools`);
  logger.info(`  Chart tools: ${CHART_TOOLS.length}`);
  logger.info(`  Network tools: ${NETWORK_TOOLS.length}`);
}
