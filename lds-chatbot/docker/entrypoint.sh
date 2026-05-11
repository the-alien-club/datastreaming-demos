#!/bin/bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

# Parse host + port out of the DATABASE_URL for pg_isready.
# Expected: postgres://user:pass@host:port/db
pg_host=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
pg_port=$(echo "$DATABASE_URL" | sed -nE 's|.*@[^:/]+:([0-9]+).*|\1|p')
pg_port=${pg_port:-5432}

echo "[entrypoint] Waiting for Postgres at ${pg_host}:${pg_port}..."
attempts=0
until pg_isready -h "$pg_host" -p "$pg_port" -q; do
  attempts=$((attempts + 1))
  if [[ $attempts -ge 60 ]]; then
    echo "[entrypoint] ERROR: Postgres not ready after ${attempts} attempts" >&2
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] Postgres is ready."

echo "[entrypoint] Checking Prisma migration state..."

# Detect whether _prisma_migrations exists.
# Returns "t" if it does, "f" if it does not.
_has_prisma_table=$(psql "$DATABASE_URL" -tAc \
  "SELECT EXISTS (
     SELECT FROM pg_tables
     WHERE schemaname = 'public'
     AND tablename = '_prisma_migrations'
   );")

if [[ "$_has_prisma_table" == "f" ]]; then
  echo "[entrypoint] _prisma_migrations table not found — resolving baseline..."
  node /app/node_modules/.bin/prisma migrate resolve --applied "0001_baseline"
  echo "[entrypoint] Baseline resolved."
fi

echo "[entrypoint] Applying Prisma migrations..."
node /app/node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Applying better-auth migrations..."
node /app/node_modules/tsx/dist/cli.mjs /app/scripts/migrate-auth.ts

echo "[entrypoint] Starting Next.js server..."

# Optional fetch tracer for production debugging — set FETCH_TRACE=1 in the
# Deployment env to log every globalThis.fetch URL + status. No-op when unset.
if [[ "${FETCH_TRACE:-}" = "1" ]]; then
  cat > /tmp/fetch-trace.cjs <<'EOF'
const _orig = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || (input && input.href) || String(input)
  process.stderr.write('[FETCH] ' + url + '\n')
  try { const r = await _orig(input, init); process.stderr.write('[FETCH-OK] ' + r.status + ' ' + url + '\n'); return r }
  catch (e) { process.stderr.write('[FETCH-ERR] ' + (e && e.cause && e.cause.code || e.message) + ' ' + url + '\n'); throw e }
}
EOF
  exec node --require /tmp/fetch-trace.cjs /app/server.js
fi

exec node /app/server.js
