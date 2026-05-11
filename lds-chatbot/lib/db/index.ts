import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client"

// In production DATABASE_URL is required and injected by the Helm chart.
// In dev, default to the Postgres from docker-compose.yml so a fresh clone
// `docker compose up -d && npm run dev` works with no .env.
const connectionString =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production"
    ? null
    : "postgres://postgres:postgres@localhost:5435/lds_chatbot")
if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

// ─── Shared pg Pool ───────────────────────────────────────────────────────────
// Shared by both better-auth (Kysely adapter in lib/auth.ts) and Prisma
// (driver adapter below). A single pool avoids double connection overhead.
export const pool = new Pool({ connectionString })

// ─── Prisma client (application queries) ─────────────────────────────────────
// Prisma v7 requires a Driver Adapter to receive the connection URL at runtime.
// We use @prisma/adapter-pg so Prisma shares the pool above.
// Singleton pattern survives Next.js hot reload in development.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/**
 * Better-auth's Kysely adapter quotes identifiers, so `"accessToken"` /
 * `"userId"` / `"providerId"` preserve their camelCase casing in Postgres.
 */

/** Returns the stored Authentik access token for a user, or null if not found. */
export async function getStoredOAuthToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "authentik" },
    select: { accessToken: true },
  })
  return account?.accessToken ?? null
}

/** Reverse-lookup: given an Authentik access token, return the better-auth userId. */
export async function getUserIdFromToken(accessToken: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { accessToken, providerId: "authentik" },
    select: { userId: true },
  })
  return account?.userId ?? null
}

/**
 * Resolves a list of better-auth user IDs to display names. Returns a Map
 * keyed by user id, with the user's `name` (falling back to email) as value.
 * IDs absent from the result map could not be resolved.
 */
export async function getUserNamesByIds(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const unique = Array.from(new Set(userIds))
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map((u) => [u.id, u.name?.trim() || u.email]))
}
