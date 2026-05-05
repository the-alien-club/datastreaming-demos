/**
 * Next.js instrumentation hook — runs once at server startup before any
 * request is handled.
 *
 * In production (NODE_ENV=production) we replace the global `console.*`
 * methods with Pino so every app-level log line is emitted as a single
 * JSON object. That makes SigNoz / OTEL filelog parsers happy:
 *
 *   {"level":30,"time":1714900000000,"pid":1,"hostname":"pod","msg":"..."}
 *
 * In development we leave console untouched so Next.js' pretty dev-server
 * output remains readable.
 *
 * Note: Next.js's own HTTP access logs (e.g. "GET /api/chat 200 in 42ms")
 * are written by the framework's internal logger and bypass this hook. They
 * will remain plain text. Everything emitted by app code via console.* or
 * via `lib/logger.ts` will be JSON.
 */
export async function register() {
  // Only run on the Node.js runtime (not edge) and only in production.
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production"
  ) {
    return
  }

  const { pino } = await import("pino")

  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    // Timestamp as epoch milliseconds — OTEL filelog expects a numeric time.
    timestamp: pino.stdTimeFunctions.epochTime,
    formatters: {
      // Map pino's numeric level to a human-readable string in the JSON so
      // SigNoz severity mapping works without custom field remapping.
      level: (label) => ({ level: label }),
    },
  })

  // Replace global console methods so any existing `console.log` / `console.error`
  // call in app code automatically emits JSON without any code changes.
  const stringify = (args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === "string") return args[0]
    if (args.length === 1 && typeof args[0] === "object") return args[0]
    return args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
  }

  console.log = (...args: unknown[]) => logger.info(stringify(args))
  console.info = (...args: unknown[]) => logger.info(stringify(args))
  console.warn = (...args: unknown[]) => logger.warn(stringify(args))
  console.error = (...args: unknown[]) => logger.error(stringify(args))
  console.debug = (...args: unknown[]) => logger.debug(stringify(args))
}
