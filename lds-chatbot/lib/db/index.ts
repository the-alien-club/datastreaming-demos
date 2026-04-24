import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

export const sqlite = new Database("sqlite.db")
export const db = drizzle(sqlite, { schema })

/** Returns the stored Authentik access token for a user, or null if not found. */
export function getStoredOAuthToken(userId: string): string | null {
  const row = sqlite
    .prepare("SELECT accessToken FROM account WHERE userId = ? AND providerId = 'authentik'")
    .get(userId) as { accessToken?: string } | undefined
  return row?.accessToken ?? null
}

/** Reverse-lookup: given an Authentik access token, return the better-auth userId. */
export function getUserIdFromToken(accessToken: string): string | null {
  const row = sqlite
    .prepare("SELECT userId FROM account WHERE accessToken = ? AND providerId = 'authentik'")
    .get(accessToken) as { userId?: string } | undefined
  return row?.userId ?? null
}
