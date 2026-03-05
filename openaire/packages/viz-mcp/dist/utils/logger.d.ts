/**
 * Visualization MCP Logger
 *
 * Structured logging utility with configurable log levels.
 * All output goes to stderr to avoid interfering with MCP stdio transport.
 *
 * Configuration:
 *   Set LOG_LEVEL environment variable to: error, warn, info (default), or debug.
 */
/**
 * Structured logger for the visualization MCP server.
 *
 * Uses stderr for all output to keep stdout clean for MCP JSON protocol.
 */
export declare const logger: {
    error: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    info: (message: string, meta?: unknown) => void;
    debug: (message: string, meta?: unknown) => void;
};
//# sourceMappingURL=logger.d.ts.map