// One-shot seeder: copy the legacy `lib/mcps/config.json` MCP entries into the
// `mcps` table so existing demo deployments don't lose their built-in legal
// MCPs when the static-config loader is retired.
//
// Idempotent: ON CONFLICT (id) DO UPDATE — re-running keeps URLs / metadata
// in sync with the source of truth (this file). Tokens stay public per the
// project's intentional posture; if you want them gone, rotate at the
// provider and update the constants below.
//
// Usage (against the local dev DB):
//   docker compose up -d
//   DATABASE_URL=postgres://postgres:postgres@localhost:5435/lds_chatbot \
//     node scripts/seed-mcps.mjs
//
// Usage (against the prod DB via kubectl exec, run from the postgres pod):
//   kubectl --context platform-prod -n demo-lds-chatbot \
//     cp scripts/seed-mcps.mjs demo-lds-chatbot-prod-postgres-0:/tmp/seed.mjs
//   ... or pipe SQL directly (see seed-mcps.sql sibling if generated).

import pg from "pg"

// Snapshot of the static config that used to live in lib/mcps/config.json.
// We keep the URLs (with their query-string tokens) here intentionally —
// existing demo deployments depend on these MCPs working out of the box.
// If you need to rotate, update the URL here AND re-run the seeder.
const SEED_MCPS = [
  {
    id: "legifrance",
    name: "Légifrance",
    serverUrl:
      "https://mcp.openlegi.fr/legifrance/mcp?token=af110fc295684c0bc558ed34cb7ab126b6af1c1774aa132bf7cbe03739e1092b",
    transport: "streamable_http",
    description: "French legal code: laws, regulations, and official codes",
    category: "legal",
  },
  {
    id: "convention-collective",
    name: "Conventions Collectives",
    serverUrl:
      "https://kali-mcp.super-novia.io/mcp?api_key=mcpf_BR4wu70C_S_K4fdFfwb0z5Hq76G7Kz_q",
    transport: "streamable_http",
    description: "French collective bargaining agreements (Kali database)",
    category: "legal",
  },
]

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("[seed-mcps] DATABASE_URL is not set")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })

try {
  for (const mcp of SEED_MCPS) {
    await pool.query(
      `INSERT INTO mcps (id, name, server_url, transport, description, category, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           server_url = EXCLUDED.server_url,
           transport = EXCLUDED.transport,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           enabled = true,
           updated_at = NOW()`,
      [
        mcp.id,
        mcp.name,
        mcp.serverUrl,
        mcp.transport,
        mcp.description ?? null,
        mcp.category ?? null,
      ],
    )
    console.log(`[seed-mcps] upserted '${mcp.id}' (${mcp.name})`)
  }
  console.log(`[seed-mcps] done — ${SEED_MCPS.length} row(s) processed.`)
} finally {
  await pool.end()
}
