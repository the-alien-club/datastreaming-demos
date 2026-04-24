import { getMigrations } from "better-auth/db/migration"
import { auth } from "../lib/auth"

async function main() {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options)

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log("Database is already up to date.")
    return
  }

  if (toBeCreated.length > 0) {
    console.log("Tables to create:", toBeCreated.map((t) => t.table).join(", "))
  }
  if (toBeAdded.length > 0) {
    console.log("Columns to add:", toBeAdded.map((c) => `${c.table}.${c.field}`).join(", "))
  }

  await runMigrations()
  console.log("Migration complete.")
}

main().catch((err) => { console.error(err); process.exit(1) })
