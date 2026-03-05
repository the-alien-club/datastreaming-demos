/**
 * Tool Registration
 *
 * Registers visualization tools with the MCP server.
 * Follows the same registry pattern as mcp-openaire: each tool module
 * exports NAME, DESCRIPTION, INPUT_SCHEMA, ANNOTATIONS, and an execute function.
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
/**
 * Register all visualization tools with the MCP server.
 *
 * Sets up both the tool listing handler and the tool call dispatcher.
 * Each tool is discovered from its module's metadata constants.
 *
 * @param server - MCP Server instance to register tools with
 */
export declare function registerTools(server: Server): void;
//# sourceMappingURL=registry.d.ts.map