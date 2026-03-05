#!/usr/bin/env node
/**
 * Visualization MCP Server
 *
 * MCP server providing visualization tools for research data.
 * Creates chart objects (network, line, bar, pie) consumed by frontend components.
 *
 * Tools:
 *   - create_citation_network_chart: Interactive citation network graph
 *   - create_timeline_chart: Line chart for time series trends
 *   - create_distribution_chart: Pie or bar chart for categorical data
 *   - merge_citation_networks: Combine multiple networks into one visualization
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/index.js';

// =============================================================================
// Server Configuration
// =============================================================================

const SERVER_NAME = 'viz-tools-mcp';
const SERVER_VERSION = '0.2.0';

// =============================================================================
// Server Initialization
// =============================================================================

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all visualization tools
registerTools(server);

// =============================================================================
// Error Handling
// =============================================================================

server.onerror = (error) => {
  logger.error('Server error', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });
};

// Graceful shutdown on termination signals
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await server.close();
  process.exit(0);
});

// Catch unhandled rejections to prevent silent crashes
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  try {
    logger.info(`Starting ${SERVER_NAME}`, {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info(`${SERVER_NAME} v${SERVER_VERSION} running and ready to accept requests`);
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
