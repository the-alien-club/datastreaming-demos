-- Allow MCPs and specialists to be published so other users can discover
-- and import them. Defaults to false (private) for all existing rows.
ALTER TABLE "mcps" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;
ALTER TABLE "specialists" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;
