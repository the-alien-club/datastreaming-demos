import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { sql } from "drizzle-orm"
import * as schema from "./schema"

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

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })

/**
 * Better-auth's Kysely adapter quotes identifiers, so `"accessToken"` /
 * `"userId"` / `"providerId"` preserve their camelCase casing in Postgres.
 */

/** Returns the stored Authentik access token for a user, or null if not found. */
export async function getStoredOAuthToken(userId: string): Promise<string | null> {
  const result = await db.execute<{ accessToken: string | null }>(
    sql`SELECT "accessToken" FROM "account" WHERE "userId" = ${userId} AND "providerId" = 'authentik' LIMIT 1`
  )
  return result.rows[0]?.accessToken ?? null
}

/** Reverse-lookup: given an Authentik access token, return the better-auth userId. */
export async function getUserIdFromToken(accessToken: string): Promise<string | null> {
  const result = await db.execute<{ userId: string }>(
    sql`SELECT "userId" FROM "account" WHERE "accessToken" = ${accessToken} AND "providerId" = 'authentik' LIMIT 1`
  )
  return result.rows[0]?.userId ?? null
}
