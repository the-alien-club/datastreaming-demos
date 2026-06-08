import { z } from "zod"

const envSchema = z.object({
  PLATFORM_API_URL: z.string().url(),
  MCP_ALIEN_URL: z.string().url(),
  ADMIN_OAT: z.string().startsWith("oat_"),
  DEMO_CONFIG_SLUG: z.string().regex(/^cfg_[A-Za-z0-9_-]{6,64}$/),
  DEMO_WORKFLOW_ID: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
})

export const env = envSchema.parse({
  PLATFORM_API_URL: process.env.PLATFORM_API_URL,
  MCP_ALIEN_URL: process.env.MCP_ALIEN_URL,
  ADMIN_OAT: process.env.ADMIN_OAT,
  DEMO_CONFIG_SLUG: process.env.DEMO_CONFIG_SLUG,
  DEMO_WORKFLOW_ID: process.env.DEMO_WORKFLOW_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
})

export const PUBLIC_CONFIG_SLUG = process.env.NEXT_PUBLIC_DEMO_CONFIG_SLUG ?? "cfg_publisher_demo"
export const PUBLIC_MCP_URL =
  process.env.NEXT_PUBLIC_MCP_ALIEN_URL ?? "https://mcp.alien.club"
