import { z } from "zod"

const envSchema = z.object({
  PLATFORM_API_URL: z.string().url(),
  MCP_ALIEN_URL: z.string().url(),
  ADMIN_OAT: z.string().startsWith("oat_"),
  /**
   * Optional bootstrap fallback. When set AND the browser has no
   * `cfg_*` slug in localStorage (or that slug 404s), the demo reuses
   * this configuration on first load. Useful for fixed presentations
   * where every viewer should land on the same curated config. Leave
   * unset for the general multi-user demo where each browser gets its
   * own auto-created config.
   */
  DEMO_CONFIG_SLUG: z
    .string()
    .regex(/^cfg_[A-Za-z0-9_-]{6,64}$/)
    .optional(),
  DEMO_WORKFLOW_ID: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  /**
   * Numeric organization id. Forwarded as `x-organization-id` on every
   * platform request (admin OAT, Mode A Responses API, Mode B mcp-alien)
   * so the demo is locked to a single tenant regardless of the OAT user's
   * other org memberships.
   */
  ORG_ID: z.string().regex(/^\d+$/, "ORG_ID must be a positive integer"),
})

type Env = z.infer<typeof envSchema>

let _env: Env | null = null

/**
 * Lazy env getter — parsed on first access so production builds don't fail
 * when env vars are absent at build time (only at request time).
 */
function readEnv(): Env {
  if (_env) return _env
  // During `next build` page-data collection, env vars are intentionally absent.
  // Return placeholders that satisfy the schema; real values are validated at
  // request time on the running server.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return {
      PLATFORM_API_URL: "https://build-placeholder.invalid",
      MCP_ALIEN_URL: "https://build-placeholder.invalid",
      ADMIN_OAT: "oat_build_placeholder",
      DEMO_CONFIG_SLUG: undefined,
      DEMO_WORKFLOW_ID: "build-placeholder",
      ANTHROPIC_API_KEY: "sk-ant-build-placeholder",
      ORG_ID: "0",
    }
  }
  _env = envSchema.parse({
    PLATFORM_API_URL: process.env.PLATFORM_API_URL,
    MCP_ALIEN_URL: process.env.MCP_ALIEN_URL,
    ADMIN_OAT: process.env.ADMIN_OAT,
    // Treat empty-string the same as unset so a `DEMO_CONFIG_SLUG=` line in .env
    // means "no env bootstrap, always create per-browser configs", rather than
    // failing the slug regex.
    DEMO_CONFIG_SLUG: process.env.DEMO_CONFIG_SLUG || undefined,
    DEMO_WORKFLOW_ID: process.env.DEMO_WORKFLOW_ID,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ORG_ID: process.env.ORG_ID,
  })
  return _env
}

export const env = new Proxy({} as Env, {
  get(_target, prop: keyof Env) {
    return readEnv()[prop]
  },
})

export const PUBLIC_MCP_URL = process.env.NEXT_PUBLIC_MCP_ALIEN_URL ?? "https://mcp.alien.club"
