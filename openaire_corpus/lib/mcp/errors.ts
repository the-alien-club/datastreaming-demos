// lib/mcp/errors.ts
// Typed error hierarchy for OpenAIRE MCP HTTP client failures.
// Callers handle each error class explicitly — no silent swallowing.

/** Base class for all OpenAIRE MCP failures. */
export class McpError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message)
    this.name = "McpError"
  }
}

/** HTTP 401 / 403 — bearer token missing, expired, or rejected. Terminal: no retry. */
export class McpAuthError extends McpError {
  constructor(m = "MCP auth failed") {
    super(m)
    this.name = "McpAuthError"
  }
}

/** HTTP 429 — MCP rate limit hit. Retryable after `retryAfterMs` (if provided). */
export class McpRateLimitError extends McpError {
  retryAfterMs?: number

  constructor(m = "MCP rate limited", retryAfterMs?: number) {
    super(m)
    this.name = "McpRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

/** HTTP 404 on a lookup — record not found. Terminal: no retry. */
export class McpNotFoundError extends McpError {
  constructor(m = "record not found") {
    super(m)
    this.name = "McpNotFoundError"
  }
}
