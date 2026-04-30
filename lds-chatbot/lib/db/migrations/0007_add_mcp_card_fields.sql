-- Add card-display fields to `mcps`: multi-category tags, data type,
-- provider, and price-per-query. Backfills existing `category` values
-- into the new `categories` array, then drops the old single-value
-- column.

ALTER TABLE "mcps"
  ADD COLUMN "categories" text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint

UPDATE "mcps"
SET "categories" = ARRAY["category"]::text[]
WHERE "category" IS NOT NULL AND "category" <> '';
--> statement-breakpoint

ALTER TABLE "mcps" DROP COLUMN "category";
--> statement-breakpoint

ALTER TABLE "mcps"
  ADD COLUMN "type" text,
  ADD COLUMN "provider" text,
  ADD COLUMN "price_per_query" text;
