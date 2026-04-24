import path from "node:path"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

const connectionString =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production"
    ? null
    : "postgres://postgres:postgres@localhost:5435/lds_chatbot")
if (!connectionString) {
  console.error("[migrate-db] DATABASE_URL is not set")
  process.exit(1)
}

const migrationsFolder = process.env.DB_MIGRATIONS_DIR ?? path.resolve("lib/db/migrations")

const pool = new pg.Pool({ connectionString })
const db = drizzle(pool)

console.log(`[migrate-db] Applying drizzle migrations from ${migrationsFolder}`)
await migrate(db, { migrationsFolder })
console.log("[migrate-db] Drizzle migrations complete.")
await pool.end()
