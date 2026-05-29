/**
 * Typed structured logger for API routes and server-side code.
 *
 * In production, each call emits a JSON line to stdout. In development the
 * output falls back to the standard console so Next.js' dev overlay stays
 * readable.
 *
 * Usage:
 *   import { logger } from "@/lib/logger"
 *   logger.info({ agentId, userId }, "chat turn started")
 *   logger.error({ err }, "platform call failed")
 */

import pino from "pino"

const isDev = process.env.NODE_ENV !== "production"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.epochTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // In dev, keep JSON output off so Next.js' terminal stays readable.
  // Swap to `transport: { target: "pino-pretty" }` if you prefer pretty
  // dev logs (requires `pino-pretty` as a dev dependency).
  ...(isDev ? { enabled: false } : {}),
})
