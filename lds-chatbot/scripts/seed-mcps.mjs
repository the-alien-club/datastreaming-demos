// One-shot seeder: copy the legacy `lib/mcps/config.json` MCP entries into the
// `mcps` table so existing demo deployments don't lose their built-in legal
// MCPs when the static-config loader is retired.
//
// Idempotent. Seeds one row per (built-in id, user) pair: every user that
// exists in the better-auth `user` table gets the full set of built-in MCPs.
// On conflict (id already present for that user), the existing row's
// metadata is refreshed.
//
// Usage (against the local dev DB):
//   docker compose up -d
//   DATABASE_URL=postgres://postgres:postgres@localhost:5435/lds_chatbot \
//     node scripts/seed-mcps.mjs
//
// Usage (against the prod DB via kubectl exec — see seed-mcps.sql sibling
// for a SQL-only variant when piping through `psql -f`).

import pg from "pg"

// Snapshot of the static config that used to live in lib/mcps/config.json.
// We keep the URLs (with their query-string tokens) here intentionally —
// existing demo deployments depend on these MCPs working out of the box.
// If you need to rotate, update the URL here AND re-run the seeder.
const SEED_MCPS = [
  {
    slug: "legifrance",
    name: "Légifrance",
    serverUrl:
      "https://mcp.openlegi.fr/legifrance/mcp?token=af110fc295684c0bc558ed34cb7ab126b6af1c1774aa132bf7cbe03739e1092b",
    transport: "streamable_http",
    description: "French legal code: laws, regulations, and official codes",
    categories: ["Generalites", "Droit public"],
    type: "Open Data",
    provider: "Etat",
    pricePerQuery: "Gratuit",
  },
  {
    slug: "convention-collective",
    name: "Conventions Collectives",
    serverUrl:
      "https://kali-mcp.super-novia.io/mcp?api_key=mcpf_BR4wu70C_S_K4fdFfwb0z5Hq76G7Kz_q",
    transport: "streamable_http",
    description: "French collective bargaining agreements (Kali database)",
    categories: ["Droit social"],
    type: "Open Data",
    provider: "Etat",
    pricePerQuery: "Gratuit",
  },
]

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("[seed-mcps] DATABASE_URL is not set")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })

try {
  const { rows: users } = await pool.query(`SELECT id FROM "user" ORDER BY id`)
  if (users.length === 0) {
    console.warn("[seed-mcps] no users found — nothing to seed.")
    process.exit(0)
  }

  let inserted = 0
  let updated = 0
  for (const user of users) {
    for (const mcp of SEED_MCPS) {
      const id = `${mcp.slug}:${user.id}`
      const result = await pool.query(
        `INSERT INTO mcps (id, user_id, name, server_url, transport, description, categories, type, provider, price_per_query, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             server_url = EXCLUDED.server_url,
             transport = EXCLUDED.transport,
             description = EXCLUDED.description,
             categories = EXCLUDED.categories,
             type = EXCLUDED.type,
             provider = EXCLUDED.provider,
             price_per_query = EXCLUDED.price_per_query,
             enabled = true,
             updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          id,
          user.id,
          mcp.name,
          mcp.serverUrl,
          mcp.transport,
          mcp.description ?? null,
          mcp.categories ?? [],
          mcp.type ?? null,
          mcp.provider ?? null,
          mcp.pricePerQuery ?? null,
        ],
      )
      if (result.rows[0]?.inserted) inserted += 1
      else updated += 1
    }
  }

  console.log(
    `[seed-mcps] done — ${SEED_MCPS.length} MCP(s) × ${users.length} user(s); ${inserted} inserted, ${updated} updated.`,
  )
} finally {
  await pool.end()
}
