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

echo "[entrypoint] Applying drizzle migrations..."
node /app/scripts/migrate-db.mjs

echo "[entrypoint] Applying better-auth migrations..."
node /app/node_modules/tsx/dist/cli.mjs /app/scripts/migrate-auth.ts

echo "[entrypoint] Starting Next.js server..."
exec node /app/server.js
