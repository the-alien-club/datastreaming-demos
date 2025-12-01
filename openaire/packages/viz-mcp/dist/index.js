#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/logger.js';
const SERVER_NAME = 'viz-tools-mcp';
const SERVER_VERSION = '0.1.0';
// Create MCP server
const server = new Server({
    name: SERVER_NAME,
    version: SERVER_VERSION,
}, {
    capabilities: {
        tools: {},
    },
});
// Register tools
registerTools(server);
// Error handling
server.onerror = (error) => {
    logger.error('Server error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
    });
};
// Handle process termination
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
// Start server
async function main() {
    try {
        logger.info('Starting Viz Tools MCP Server', {
            name: SERVER_NAME,
            version: SERVER_VERSION,
        });
        const transport = new StdioServerTransport();
        await server.connect(transport);
        logger.info('Viz Tools MCP Server running and ready to accept requests');
    }
    catch (error) {
        logger.error('Failed to start server', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });
        process.exit(1);
    }
}
// Run server
main();
//# sourceMappingURL=index.js.map