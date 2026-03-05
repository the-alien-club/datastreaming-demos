/**
 * Visualization MCP Logger
 *
 * Structured logging utility with configurable log levels.
 * All output goes to stderr to avoid interfering with MCP stdio transport.
 *
 * Configuration:
 *   Set LOG_LEVEL environment variable to: error, warn, info (default), or debug.
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = LEVELS[LOG_LEVEL];
  const threshold = configuredLevel !== undefined ? configuredLevel : LEVELS.info;
  return LEVELS[level] <= threshold;
}

function formatMeta(meta?: unknown): string {
  if (!meta) return '';
  try {
    return ' ' + JSON.stringify(meta, null, 2);
  } catch {
    return ` [unserializable: ${typeof meta}]`;
  }
}

/**
 * Structured logger for the visualization MCP server.
 *
 * Uses stderr for all output to keep stdout clean for MCP JSON protocol.
 */
export const logger = {
  error: (message: string, meta?: unknown): void => {
    if (shouldLog('error')) {
      console.error(`[ERROR] ${message}${formatMeta(meta)}`);
    }
  },

  warn: (message: string, meta?: unknown): void => {
    if (shouldLog('warn')) {
      console.warn(`[WARN] ${message}${formatMeta(meta)}`);
    }
  },

  info: (message: string, meta?: unknown): void => {
    if (shouldLog('info')) {
      console.error(`[INFO] ${message}${formatMeta(meta)}`);
    }
  },

  debug: (message: string, meta?: unknown): void => {
    if (shouldLog('debug')) {
      console.error(`[DEBUG] ${message}${formatMeta(meta)}`);
    }
  },
};
