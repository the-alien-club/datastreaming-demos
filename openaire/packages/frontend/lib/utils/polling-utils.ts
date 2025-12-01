/**
 * Polling configuration and utilities
 */

export const POLLING_CONFIG = {
  INTERVAL_MS: 2000, // Poll every 2 seconds
  TIMEOUT_MS: 15 * 60 * 1000, // 15 minutes max (increased for complex multi-agent queries)
};

export interface PollingCleanup {
  stop: () => void;
}

/**
 * Create a polling interval with automatic cleanup
 */
export function createPollingInterval(
  callback: () => void | Promise<void>,
  intervalMs: number = POLLING_CONFIG.INTERVAL_MS
): NodeJS.Timeout {
  return setInterval(callback, intervalMs);
}

/**
 * Create a timeout cleanup handler
 */
export function createPollingTimeout(
  onTimeout: () => void,
  timeoutMs: number = POLLING_CONFIG.TIMEOUT_MS
): NodeJS.Timeout {
  return setTimeout(() => {
    console.log("Polling timeout reached");
    onTimeout();
  }, timeoutMs);
}

/**
 * Create a complete polling cleanup handler
 */
export function createPollingCleanup(
  interval: NodeJS.Timeout,
  timeout: NodeJS.Timeout
): PollingCleanup {
  return {
    stop: () => {
      clearInterval(interval);
      clearTimeout(timeout);
    },
  };
}
