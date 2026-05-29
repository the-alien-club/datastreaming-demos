# Prisma Baseline Migration Playbook

**Applies to**: lds-chatbot  
**Prisma version**: 7.8.0  
**Status**: Pre-baseline — no `prisma/migrations/` directory exists  
**Written**: 2026-05-11

---

## Situation

The database schema was originally managed by Drizzle ORM. Drizzle migrations have been removed and
Prisma v7 is now the ORM. `prisma db pull` was used to generate `prisma/schema.prisma` from the
existing database. No `prisma/migrations/` directory exists yet.

The production database has the correct schema and live data. `docker/entrypoint.sh` runs
`prisma migrate deploy` on every container start. **Without a baseline migration this command will
error on first run** because `_prisma_migrations` does not exist — Prisma will try to create the
full schema from scratch and fail on `CREATE TABLE` conflicts against existing tables.

The database has 11 tables and no migration tracking table of any kind (the old Drizzle table was
cleaned up).

---

## Prisma v7 — differences from v5/v6 that matter here

- Configuration is in `prisma.config.ts` (not `prisma.config.json` or schema `datasource` block).
  The CLI reads this file for the database URL. All commands below rely on it.
- `prisma migrate dev --create-only` still works exactly as in v5/v6 — it generates the SQL file but
  does NOT apply it to the database.
- `prisma migrate resolve --applied <name>` still works exactly as in v5/v6 — it writes a row into
  `_prisma_migrations` marking a migration as applied without executing its SQL.
- `prisma db execute` is available and unchanged.
- There is no new "baseline" command — the documented Prisma pattern (diff from empty to schema,
  resolve --applied) is the correct approach in all versions including v7.

---

## Phase 1 — Local: Generate the baseline migration

**Precondition**: `docker compose up -d` is running (local DB on port 5435). `DATABASE_URL` in
`.env` points to it.

### Step 1.1 — Generate the baseline SQL using `migrate diff`

`prisma migrate dev --create-only` works but produces the schema diff from whatever Prisma thinks
the current state is. Because there is no migrations directory yet, it would produce a full
`CREATE TABLE` script — which is exactly what we want for a baseline, but we must **not** apply
it to the existing database.

The cleaner, deterministic approach is `prisma migrate diff`:

```bash
cd /home/xqua/Documents/Work/Alien/DataStreaming/datastreaming-demos/lds-chatbot

# Create the migrations directory structure. Prisma expects this to exist.
mkdir -p prisma/migrations

# Generate the baseline SQL: diff from an empty database to the current schema.
# This produces the full CREATE TABLE / CREATE INDEX / ADD CONSTRAINT DDL.
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script \
  --output /tmp/baseline.sql
```

Inspect the output before proceeding:

```bash
cat /tmp/baseline.sql
```

You should see `CREATE TABLE` statements for all 11 tables, `CREATE INDEX` statements, and
`ALTER TABLE ... ADD CONSTRAINT` statements for foreign keys. There must be **no `DROP TABLE`,
no `ALTER TABLE ... DROP COLUMN`, no `DELETE`**. Verify the table list:

```bash
grep -E "^CREATE TABLE" /tmp/baseline.sql
# Expected output (order may vary):
# CREATE TABLE "public"."user" (
# CREATE TABLE "public"."account" (
# CREATE TABLE "public"."session" (
# CREATE TABLE "public"."verification" (
# CREATE TABLE "public"."agents" (
# CREATE TABLE "public"."agent_subagents" (
# CREATE TABLE "public"."conversations" (
# CREATE TABLE "public"."datasets" (
# CREATE TABLE "public"."mcps" (
# CREATE TABLE "public"."messages" (
# CREATE TABLE "public"."specialists" (
```

Count must be 11. If it is not 11, stop and investigate the schema diff before continuing.

### Step 1.2 — Place the baseline SQL in the migrations directory

Prisma migration directories are named `<timestamp>_<name>`. Use an early timestamp so this
baseline sorts first in history.

```bash
MIGRATION_NAME="0001_baseline"
MIGRATION_DIR="prisma/migrations/${MIGRATION_NAME}"
mkdir -p "${MIGRATION_DIR}"
cp /tmp/baseline.sql "${MIGRATION_DIR}/migration.sql"
```

The directory must be named exactly `0001_baseline` — do not use a date-based name like
`20260511_baseline`. Using a sequential prefix guarantees it always sorts first regardless of
when future developers clone the repo, and avoids confusion with auto-generated timestamp names.

**Do not use `prisma migrate dev --create-only` for the baseline.** That command generates the
migrations directory automatically but uses a timestamp name, and more importantly it exits with
an error when the database already contains the schema (because it tries to detect drift). The
`migrate diff` approach above is explicit and fully deterministic.

### Step 1.3 — Mark the baseline as applied on the local DB

The local DB already has all the tables. We must tell Prisma "this migration was already applied"
without re-running the SQL.

```bash
npx prisma migrate resolve --applied "0001_baseline"
```

This creates the `_prisma_migrations` table in the local DB and inserts one row recording the
baseline as applied. It does NOT execute any SQL from `migration.sql`.

### Step 1.4 — Verify local state

```bash
# Check Prisma migration status — must report "Database schema is up to date!"
npx prisma migrate status
```

Expected output:
```
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma/schema.prisma.

1 migration found in prisma/migrations

Following migration have been applied:

Migration Name       Applied At
────────────────────────────────────────────
0001_baseline        <timestamp>

Your local database is up to date!
```

If the status reports any pending migration or any drift, **stop**. Do not proceed to Phase 2.

```bash
# Secondary check: verify _prisma_migrations table exists and has exactly 1 row
PGPASSWORD=postgres psql postgresql://postgres:postgres@localhost:5435/lds_chatbot \
  -c "SELECT id, migration_name, finished_at, applied_steps_count FROM _prisma_migrations;"
```

The row must have `applied_steps_count = 1` and a non-null `finished_at`.

```bash
# Tertiary check: verify no schema drift — diff from migrations dir to live DB must be empty
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-config-datasource \
  --exit-code
# Exit code 0 = no drift. Exit code 2 = drift detected (investigate before continuing).
```

### Step 1.5 — Commit

```bash
git add prisma/migrations/0001_baseline/migration.sql
git commit -m "feat(db): add Prisma v7 baseline migration from Drizzle schema"
```

Do not commit `.env` or any secrets.

---

## Phase 2 — First production deploy

**The core problem**: production has the correct schema but no `_prisma_migrations` table.
`prisma migrate deploy` (run by the entrypoint) will see 1 pending migration (`0001_baseline`)
and attempt to run its SQL. That SQL is full `CREATE TABLE` statements — they will fail with
`ERROR: relation "user" already exists`, crashing the container.

**The solution**: Before the first `prisma migrate deploy` run, mark `0001_baseline` as applied
on the production DB using `prisma migrate resolve --applied`. This must happen exactly once,
the first time the new image is deployed.

### Step 2.1 — Update the entrypoint to handle the bootstrap case

The entrypoint must detect whether `_prisma_migrations` exists. If it does not, the database is
being bootstrapped from Drizzle and the baseline must be resolved before `migrate deploy` runs.
If it does exist, `migrate deploy` runs normally.

Replace the migration block in `docker/entrypoint.sh`:

```bash
# ── BEFORE (single line) ──────────────────────────────────────────────────────
echo "[entrypoint] Applying Prisma migrations..."
node /app/node_modules/.bin/prisma migrate deploy
```

```bash
# ── AFTER ─────────────────────────────────────────────────────────────────────
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
```

**Why this is safe**:
- The `psql` command is a read-only catalog query; it cannot cause data loss.
- `migrate resolve --applied` only inserts a row into `_prisma_migrations`; it does not touch
  application tables.
- `migrate deploy` will see the baseline as already applied and find no pending migrations on
  first run. Subsequent runs behave identically to before.
- The `if` block only fires when `_prisma_migrations` does not exist. After first run it is
  a no-op forever.
- `set -euo pipefail` is already set; any psql or prisma failure exits non-zero and kills the
  container — Kubernetes restarts it, which is the safe failure mode.

**Dependency**: `psql` must be available in the container image. Check the Dockerfile:

```bash
grep -i psql /home/xqua/Documents/Work/Alien/DataStreaming/datastreaming-demos/lds-chatbot/Dockerfile
```

The entrypoint already uses `pg_isready` (which ships with `postgresql-client`). `psql` is in the
same package. If `pg_isready` works today, `psql` is already present. Verify:

```bash
docker run --rm <image-name> psql --version
```

If `psql` is absent, add `RUN apt-get install -y postgresql-client` to the Dockerfile (or use
the `postgres:16-alpine` base which already includes it).

### Step 2.2 — Deploy sequence

1. Build and push the new image (includes the updated entrypoint and the baseline migration file).
2. Deploy to production (update the Helm release / Deployment image tag).
3. The container starts, waits for Postgres readiness (existing logic), then:
   - Detects `_prisma_migrations` absent → resolves baseline → `migrate deploy` finds 0 pending.
4. Application starts normally.

**Do not run `psql` or any manual commands against the production database.** The entrypoint
handles everything.

### Step 2.3 — Verify the production deploy

After the rollout completes (all pods Running):

```bash
# Check pod logs for the expected sequence
kubectl logs -n <namespace> deployment/<deployment-name> --tail=20
```

Expected log lines:
```
[entrypoint] Postgres is ready.
[entrypoint] Checking Prisma migration state...
[entrypoint] _prisma_migrations table not found — resolving baseline...
[entrypoint] Baseline resolved.
[entrypoint] Applying Prisma migrations...
[entrypoint] Applying better-auth migrations...
[entrypoint] Starting Next.js server...
```

On subsequent pod restarts the log will show:
```
[entrypoint] Checking Prisma migration state...
[entrypoint] Applying Prisma migrations...
```
(No "resolving baseline" line — the table already exists.)

If the logs show an error from `migrate deploy` (e.g. `CREATE TABLE` failure), see Phase 4.

---

## Phase 3 — Future schema changes

### The correct workflow

**Never** edit `prisma/schema.prisma` and push without creating a migration. The workflow is:

#### On a feature branch (local dev)

```bash
# 1. Edit prisma/schema.prisma to add/modify/remove fields or models.

# 2. Generate a migration (writes SQL, applies it to local DB, regenerates client).
npx prisma migrate dev --name <descriptive_name>
# Example: npx prisma migrate dev --name add_agent_is_archived_flag

# 3. Inspect the generated SQL before committing.
cat prisma/migrations/<timestamp>_<descriptive_name>/migration.sql
# Must contain only the intended changes. No accidental drops.

# 4. Run tests.
npm test

# 5. Commit schema + migration together. Never separate them.
git add prisma/schema.prisma prisma/migrations/<timestamp>_<descriptive_name>/
git commit -m "feat(db): add is_archived flag to agents"
```

#### On staging and production

`prisma migrate deploy` (run by the entrypoint) applies any unapplied migrations in order. No
manual steps are required after the baseline is established.

#### Rules

- **Never use `prisma db push`** in any environment. It bypasses the migration system and causes
  drift that is difficult to recover from.
- **Never hand-edit migration SQL after committing it**. If you need to fix a migration that has
  not been deployed yet, create a new migration that corrects it.
- **Never run `prisma migrate reset`** in staging or production. It drops and recreates the
  entire database. It is only acceptable in local dev.
- **Always review generated SQL** before committing. Prisma correctly handles most cases but
  certain operations (column renames, type changes) produce a `DROP COLUMN` + `ADD COLUMN` pair
  that loses data. For those cases, write the migration manually using `--create-only` and edit
  the SQL to use `ALTER COLUMN` or a data-preserving approach.
- **One migration per logical change**. Do not bundle unrelated schema changes into one migration.

### Add to CLAUDE.md

Add the following section to the CLAUDE.md in this repo under "Development":

```markdown
## Database migrations

Schema is managed by Prisma v7. The migration history starts from a baseline
(`prisma/migrations/0001_baseline/`) that captures the schema inherited from Drizzle.

**To make a schema change:**
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <descriptive_name>` — this generates the migration SQL,
   applies it locally, and regenerates the Prisma client in `lib/generated/prisma/`.
3. Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`.
4. Commit `prisma/schema.prisma` and the new migration directory together.

Production and staging apply migrations automatically on container startup via
`prisma migrate deploy` in `docker/entrypoint.sh`.

**Never use `prisma db push`** — it bypasses migration tracking.  
**Never run `prisma migrate reset`** outside local dev — it destroys data.  
**Always review generated SQL** — watch for accidental `DROP COLUMN` on renames.
```

---

## Phase 4 — Rollback plan

### Scenario A: the baseline resolution step failed

The entrypoint exited non-zero during `prisma migrate resolve --applied`. The `_prisma_migrations`
table may or may not have been created. Application tables are untouched.

**Recovery**: The container will be restarting (CrashLoopBackOff). Investigate the logs:

```bash
kubectl logs -n <namespace> deployment/<deployment-name> --previous
```

Common causes:
- `psql` not available in the image → add `postgresql-client` to Dockerfile, rebuild.
- `DATABASE_URL` format not understood by `psql` → test locally with the exact URL.
- Network policy blocking the psql connection (unlikely if `pg_isready` passed) → check pod network.

Fix the cause, rebuild and redeploy. The entrypoint is idempotent — it checks for the table's
existence before resolving, so a retry is safe.

### Scenario B: `migrate deploy` ran before the baseline was resolved

If the entrypoint ran `migrate deploy` without first resolving the baseline (e.g. the detection
logic had a bug), Prisma will have attempted to execute the baseline SQL and failed with:

```
ERROR: relation "user" already exists
```

The migration will be recorded in `_prisma_migrations` with `rolled_back_at` set (failed state).
All application tables are untouched (the SQL failed before creating anything).

**Recovery**:

```bash
# 1. Stop the failing deployment (scale to 0 pods to stop the crash loop).
kubectl scale deployment/<deployment-name> -n <namespace> --replicas=0

# 2. Connect to the production database via a one-off pod or bastion.
# Run this to check the state of the migrations table:
psql "$PRODUCTION_DATABASE_URL" \
  -c "SELECT migration_name, started_at, finished_at, rolled_back_at FROM _prisma_migrations;"
# You should see 0001_baseline with a non-null rolled_back_at.

# 3. Delete the failed migration record.
psql "$PRODUCTION_DATABASE_URL" \
  -c "DELETE FROM _prisma_migrations WHERE migration_name = '0001_baseline';"

# 4. Resolve it as applied instead.
# You cannot run prisma resolve locally against production without the production DATABASE_URL.
# Run it via a one-off pod with the production URL:
DATABASE_URL="$PRODUCTION_DATABASE_URL" \
  node /app/node_modules/.bin/prisma migrate resolve --applied "0001_baseline"
# Or equivalently, insert the row manually (only if you cannot run the CLI):
psql "$PRODUCTION_DATABASE_URL" -c "
INSERT INTO _prisma_migrations (
  id, checksum, finished_at, migration_name, logs,
  rolled_back_at, started_at, applied_steps_count
) VALUES (
  gen_random_uuid(),
  '<checksum_from_local_row>',  -- copy from local _prisma_migrations
  NOW(),
  '0001_baseline',
  NULL,
  NULL,
  NOW(),
  1
);"
# Prefer the CLI approach. The manual insert is a last resort.

# 5. Scale the deployment back up.
kubectl scale deployment/<deployment-name> -n <namespace> --replicas=1

# 6. Verify logs show normal startup (no baseline resolution, migrate deploy finds 0 pending).
```

### Scenario C: `migrate deploy` ran and partially succeeded

This would mean some tables were created (unlikely given the early `CREATE TABLE "user"` failure,
but possible if the baseline SQL was edited to omit the `user` table). In this case:

- Stop the deployment immediately.
- Check which tables were created by comparing against the expected 11.
- The new partial tables are empty and can be dropped safely.
- Follow Scenario B steps to clean up `_prisma_migrations` and redeploy.

### Scenario D: need to roll back the entire deployment

The application code change is safe to roll back independently of the database — the baseline
does not change the schema, it only adds the `_prisma_migrations` table. Rolling back the image
to the previous (Drizzle-era) version will:
- Leave `_prisma_migrations` in place — harmless, the old code does not read it.
- Leave `prisma/migrations/` in Git — harmless, the old code does not use it.

There is no data risk in rolling back the image.

---

## Checklist

### Before executing Phase 1
- [ ] Local DB is running (`docker compose up -d`)
- [ ] `npx prisma migrate status` fails or shows no migrations directory (expected pre-baseline)
- [ ] `prisma/schema.prisma` accurately reflects the live DB (run `npx prisma db pull --print` and compare)

### After Phase 1
- [ ] `prisma/migrations/0001_baseline/migration.sql` exists and contains 11 `CREATE TABLE` statements
- [ ] `npx prisma migrate status` reports "up to date"
- [ ] `npx prisma migrate diff --from-migrations prisma/migrations --to-config-datasource --exit-code` exits 0
- [ ] Changes committed

### Before Phase 2
- [ ] `psql` available in the production container image
- [ ] Entrypoint changes reviewed by a second set of eyes
- [ ] Staging deploy tested first if staging exists with a pre-baseline DB

### After Phase 2
- [ ] Pod logs show expected sequence (resolve baseline → migrate deploy → start)
- [ ] Application responds to health check
- [ ] `_prisma_migrations` table exists in production with 1 row
- [ ] No error log entries
