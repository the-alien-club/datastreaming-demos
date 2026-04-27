-- Multi-tenancy isolation: scope per-user-owned tables to better-auth user.
-- Strategy: add user_id nullable, backfill all pre-existing rows to whichever
-- user owns the most data (or the first user if there's a tie / no signal),
-- then enforce NOT NULL + FK ON DELETE CASCADE. The conversations table
-- already had user_id (nullable) — promote it to NOT NULL and add the FK.

-- agents / mcps / specialists / datasets: add nullable, backfill, then lock down.
ALTER TABLE "agents" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "mcps" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "specialists" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN "user_id" text;--> statement-breakpoint

-- Backfill: assign every legacy row to the user whose id appears most
-- frequently in `conversations.user_id`. Falls back to the lexicographically-
-- first user if no conversations exist (single-tenant demo cold-start).
DO $$
DECLARE
  fallback_user_id text;
BEGIN
  SELECT user_id
  INTO fallback_user_id
  FROM (
    SELECT user_id, COUNT(*) AS n
    FROM conversations
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY n DESC, user_id ASC
    LIMIT 1
  ) AS top_user;

  IF fallback_user_id IS NULL THEN
    SELECT id INTO fallback_user_id FROM "user" ORDER BY id ASC LIMIT 1;
  END IF;

  IF fallback_user_id IS NULL THEN
    RAISE EXCEPTION 'no users found — cannot backfill user_id (run only against a DB with at least one user row)';
  END IF;

  UPDATE agents      SET user_id = fallback_user_id WHERE user_id IS NULL;
  UPDATE mcps        SET user_id = fallback_user_id WHERE user_id IS NULL;
  UPDATE specialists SET user_id = fallback_user_id WHERE user_id IS NULL;
  UPDATE datasets    SET user_id = fallback_user_id WHERE user_id IS NULL;
  UPDATE conversations SET user_id = fallback_user_id WHERE user_id IS NULL;
END $$;
--> statement-breakpoint

-- Now lock the columns down.
ALTER TABLE "agents"        ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mcps"          ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "specialists"   ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "datasets"      ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

-- FK to better-auth user with cascade delete: when a user is removed, all
-- their data goes with them. Matches the better-auth account/session pattern.
ALTER TABLE "agents"        ADD CONSTRAINT "agents_user_id_user_id_fk"        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcps"          ADD CONSTRAINT "mcps_user_id_user_id_fk"          FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialists"   ADD CONSTRAINT "specialists_user_id_user_id_fk"   FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets"      ADD CONSTRAINT "datasets_user_id_user_id_fk"      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- agent_subagents: add FK on dataset_id (was plain text, allowed orphans),
-- and drop the dead `node_id` column.
ALTER TABLE "agent_subagents" ADD CONSTRAINT "agent_subagents_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_subagents" DROP COLUMN "node_id";--> statement-breakpoint

-- Normalise built-in MCP ids to the per-user `<slug>:<userId>` shape used
-- by `scripts/seed-mcps.mjs`. Existing subagents that referenced these
-- bare-slug ids get their `mcp_ids` JSON rewritten so their workflow
-- graphs keep resolving the same MCP rows. `mcp_ids` is stored as a JSON
-- text column so a string-replace on the JSON-encoded slug is exact and
-- safe (json strings are quoted; no risk of substring collision with
-- another slug/id since neither built-in slug is a prefix of the other).
DO $$
DECLARE
  builtin_slug text;
  mcp_row RECORD;
  new_id text;
  old_quoted text;
  new_quoted text;
BEGIN
  FOREACH builtin_slug IN ARRAY ARRAY['legifrance', 'convention-collective']
  LOOP
    FOR mcp_row IN SELECT id, user_id FROM mcps WHERE id = builtin_slug LOOP
      new_id := builtin_slug || ':' || mcp_row.user_id;
      old_quoted := '"' || builtin_slug || '"';
      new_quoted := '"' || new_id || '"';
      UPDATE mcps SET id = new_id WHERE id = mcp_row.id;
      UPDATE agent_subagents
      SET mcp_ids = REPLACE(mcp_ids, old_quoted, new_quoted)
      WHERE mcp_ids IS NOT NULL AND mcp_ids LIKE '%' || old_quoted || '%';
    END LOOP;
  END LOOP;
END $$;
